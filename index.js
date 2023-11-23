require("dotenv").config();

const express = require("express"),
  querystring = require("querystring"),
  randomstring = require("randomstring"),
  axios = require("axios"),
  fs = require("fs"),
  cors = require("cors");

const app = express();

app.use(cors());
let sessions = [];

app.get("/login", (req, res) => {
  let tokens = JSON.parse(fs.readFileSync("tokens.json", "utf8"));
  if (
    !tokens.access ||
    !tokens.refresh ||
    tokens.expire_date < Date.now() ||
    tokens.access == "" ||
    tokens.refresh == ""
  ) {
    const state = randomstring.generate({
      length: 16,
      charset: "alphabetic",
    });

    sessions.push({
      state: state,
      time: Date.now(),
    });

    res.redirect(
      "https://accounts.spotify.com/authorize?" +
        querystring.stringify({
          response_type: "code",
          client_id: process.env.SPOTIFY_CLIENT_ID,
          scope: process.env.SPOTIFY_SCOPES,
          redirect_uri: process.env.SPOTIFY_REDIRECT_URL,
          state: state,
          scope: process.env.SPOTIFY_SCOPES
            ? process.env.SPOTIFY_SCOPES
            : "user-read-private user-read-email user-read-playback-state user-read-currently-playing user-read-recently-played",
        })
    );
  } else {
    return res.redirect("/me");
  }
});

app.get("/refresh", (req, res) => {
  return res.redirect("/refresh/me");
});

app.get("/refresh/:redirect", async (req, res) => {
  let tokens = JSON.parse(fs.readFileSync("tokens.json", "utf8"));
  if (!tokens.refresh || tokens.refresh == "") {
    return res.redirect("/login");
  }

  const refreshing = {
    method: "post",
    url: "https://accounts.spotify.com/api/token",
    data: `grant_type=refresh_token&refresh_token=${tokens.refresh}`,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.SPOTIFY_CLIENT_ID +
            ":" +
            process.env.SPOTIFY_CLIENT_SECRET
        ).toString("base64"),
    },
  };

  let body;
  try {
    const response = await axios(refreshing);
    body = response.data;
  } catch (e) {
    res.redirect("/problem/refreshing_failed");
    return console.error(e);
  }

  const fetchopts = {
    token: {
      access: body.access_token,
      refresh: body.refresh_token,
      date: Date.now(),
      expire_date: Date.now() + 3_600_000,
    },
  };

  tokens = fetchopts.token;
  fs.writeFileSync("tokens.json", JSON.stringify(tokens, null, 2));
  return res.redirect("/" + req.params.redirect ? req.params.redirect : "me");
});

app.get("/me", async (req, res) => {
  let tokens = JSON.parse(fs.readFileSync("tokens.json", "utf8"));
  if (
    !tokens.access ||
    !tokens.refresh ||
    tokens.expire_date < Date.now() ||
    tokens.access == "" ||
    tokens.refresh == ""
  ) {
    return res.redirect("/login");
  }

  if (tokens.expire_date < Date.now() && tokens.refresh != "") {
    return res.redirect("/refresh/me");
  }

  try {
    let response = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: "Bearer " + tokens.access },
    });

    response = response.data == "" ? null : response.data;
    return res.send({ message: true, data: response });
  } catch (e) {
    res.redirect("/problem/me_not_found");
    return console.error(e);
  }
});

app.get("/callback", async (req, res) => {
  const opt = {
    code: req.query.code || null,
    state: {
      returned: req.query.state || null,
      stored: sessions.find((o) => o.state == req.query.state) ? true : false,
    },
  };

  if (!opt.state.stored) {
    console.log(
      "State mismatch. " + opt.state.returned + " != " + opt.state.stored
    );
    return res.redirect("/problem/state_mismatch");
  }

  sessions = sessions.filter((o) => o !== req.query.state);

  const authentication = {
    method: "post",
    url: "https://accounts.spotify.com/api/token",
    data: `code=${opt.code}&redirect_uri=${process.env.SPOTIFY_REDIRECT_URL}&grant_type=authorization_code`,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.SPOTIFY_CLIENT_ID +
            ":" +
            process.env.SPOTIFY_CLIENT_SECRET
        ).toString("base64"),
    },
  };

  let body;
  try {
    const response = await axios(authentication);
    body = response.data;
  } catch (e) {
    res.redirect("/problem/authentication_failed");
    return console.error(e);
  }

  const fetchopts = {
    token: {
      access: body.access_token,
      refresh: body.refresh_token,
      date: Date.now(),
      expire_date: Date.now() + 3_600_000,
    },
  };

  let tokens = JSON.parse(fs.readFileSync("tokens.json", "utf8"));
  tokens = fetchopts.token;
  fs.writeFileSync("tokens.json", JSON.stringify(tokens, null, 2));

  return res.redirect("/me");
});

app.get("/playing", async (req, res) => {
  let tokens = JSON.parse(fs.readFileSync("tokens.json", "utf8"));
  if (
    !tokens.access ||
    !tokens.refresh ||
    tokens.expire_date < Date.now() ||
    tokens.access == "" ||
    tokens.refresh == ""
  ) {
    return res.redirect("/login");
  }

  if (tokens.expire_date < Date.now() && tokens.refresh != "") {
    return res.redirect("/refresh/playing");
  }

  try {
    let response = await axios.get(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: { Authorization: "Bearer " + tokens.access },
      }
    );

    response = response.data == "" ? null : response.data;
    return res.send({ message: true, data: response });
  } catch (e) {
    res.redirect("/problem/player_not_found");
    return console.error(e);
  }
});

app.get("/queue", async (req, res) => {
  let tokens = JSON.parse(fs.readFileSync("tokens.json", "utf8"));
  if (
    !tokens.access ||
    !tokens.refresh ||
    tokens.expire_date < Date.now() ||
    tokens.access == "" ||
    tokens.refresh == ""
  ) {
    return res.redirect("/login");
  }

  if (tokens.expire_date < Date.now() && tokens.refresh != "") {
    return res.redirect("/refresh/queue");
  }

  try {
    let response = await axios.get(
      "https://api.spotify.com/v1/me/player/queue",
      {
        headers: { Authorization: "Bearer " + tokens.access },
      }
    );

    response = response.data == "" ? null : response.data;
    return res.send({ message: true, data: response });
  } catch (e) {
    res.redirect("/problem/queue_not_found");
    return console.error(e);
  }
});

app.get("/", async (req, res) => {
  return res.redirect("/login");
});

app.get("/problem/:reason", async (req, res) => {
  return res.send({
    message: "Problem occured.",
    reason: req.params.reason ? req.params.reason : "unknown",
  });
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port http://localhost:${process.env.PORT}`);
});

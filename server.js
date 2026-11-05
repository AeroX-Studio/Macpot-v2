const express = require("express");
const path = require("node:path");
const products = require("./data/products");

const app = express();
const port = Number.parseInt(process.env.PORT || "3000", 10);
const publicDirectory = path.join(__dirname, "public");

app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/css", express.static(path.join(publicDirectory, "css"), { maxAge: "1d" }));
app.use("/js", express.static(path.join(publicDirectory, "js"), { maxAge: "1d" }));

app.get("/healthz", (_request, response) => response.json({ status: "ok" }));

app.get("/", (_request, response) => {
  response.render("index", {
    title: "MacPoint — Apple, thoughtfully chosen",
    year: new Date().getFullYear(),
    products,
  });
});

app.use((_request, response) => {
  response.status(404).render("404", {
    title: "Page not found — MacPoint",
    year: new Date().getFullYear(),
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).render("error", {
    title: "Something went wrong — MacPoint",
    year: new Date().getFullYear(),
  });
});

if (require.main === module) {
  app.listen(port, () => console.log(`MacPoint is listening on http://localhost:${port}`));
}

module.exports = app;

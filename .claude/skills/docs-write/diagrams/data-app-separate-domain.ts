// How an app on a separate domain reads and writes data, for docs/data-apps/manage.md.
import {
  CORNER_RADIUS,
  blocked,
  chip,
  connect,
  left,
  render,
  right,
  tile,
  top,
} from "./lib";

const MAIN_Y = 270;
const APP_Y = 72;

const people = tile(112, MAIN_Y, "person", "PEOPLE");
const page = tile(340, MAIN_Y, "page", "METABASE PAGE", {
  sublabels: ["METABASE.EXAMPLE.COM", "LOGGED IN"],
});
const metabase = tile(852, MAIN_Y, "metabase", "YOUR METABASE");
const app = tile(596, APP_Y, "code", "APP CODE", {
  sublabels: ["FRAME IN THE PAGE", "EXAMPLE-ISOLATED.COM", "NOT LOGGED IN"],
});

render({
  out: "docs/data-apps/images/data-app-separate-domain.png",
  title: "APP CODE ON A SEPARATE DOMAIN",
  parts: [
    people,
    page,
    metabase,
    app,
    connect([right(people), left(page)]),
    connect([left(app), [page.x, APP_Y], top(page)]),
    connect([right(page), left(metabase)], { arrows: "both" }),
    connect([right(app), [metabase.x, APP_Y], top(metabase)], {
      style: "dashed",
    }),
    chip((people.x + page.x) / 2, MAIN_Y, "OPEN THE APP"),
    chip((page.x + left(app)[0]) / 2 + 4, APP_Y, "1. ASKS THE PAGE"),
    chip(
      (right(page)[0] + left(metabase)[0]) / 2,
      MAIN_Y,
      "2. READS AND WRITES DATA",
    ),
    chip((right(app)[0] + metabase.x) / 2, APP_Y, "DIRECT REQUESTS"),
    blocked(metabase.x, (APP_Y + CORNER_RADIUS + top(metabase)[1]) / 2),
  ],
});

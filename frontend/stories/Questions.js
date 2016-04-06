import { React, Centered, storiesOf, action } from ".";

import "metabase/css/core/base.css";
import Questions from "metabase/questions/components/Questions.jsx";

storiesOf("Questions", module)
    .add("on", () =>
        <Questions {...props} />
    )

const props = {
  sections: [
    { id: "all",       name: "All questions",   icon: "star", selected: true },
    { id: "favorites", name: "Favorites",       icon: "star" },
    { id: "recent",    name: "Recently viewed", icon: "star" },
    { id: "saved",     name: "Saved by me",     icon: "star" },
    { id: "popular",   name: "Most popular",    icon: "star" }
  ],
  topics: [
    { id: 0, name: "Revenue",    icon: "star", slug: "revenue" },
    { id: 1, name: "Users",      icon: "star", slug: "users" },
    { id: 2, name: "Orders",     icon: "star", slug: "orders" },
    { id: 3, name: "Shipments",  icon: "star", slug: "shipments" }
  ],
  labels: [
    { id: 1,  name: "CATPIs",    icon: ":cat:",   slug: "catpis"},
    { id: 2,  name: "Marketing", icon: "#885AB1", slug: "marketing" },
    { id: 3,  name: "Growth",    icon: "#F9CF48", slug: "growth" },
    { id: 4,  name: "KPIs",      icon: "#9CC177", slug: "kpis" },
    { id: 5,  name: "Q1",        icon: "#ED6E6E", slug: "q1" },
    { id: 6,  name: "q2",        icon: "#ED6E6E", slug: "q2" },
    { id: 7,  name: "All-hands", icon: "#B8A2CC", slug: "all-hands" },
    { id: 9,  name: "OLD",       icon: "#2D86D4", slug: "old" },
    { id: 10, name: "v2 schema", icon: "#2D86D4", slug: "v2-schema" },
    { id: 11, name: "Rebekah",   icon: "#2D86D4", slug: "rebekah" }
  ],
  name: "All questions",
  selectedCount: 0
};
props.questions = [
  { name: "Maz's great saved question",  created: "two weeks ago", by: "Allen Gilliland", type: "pie", labels: [0].map(i => props.labels[i]) },
  { name: "Revenue by product per week", created: "two weeks ago", by: "Allen Gilliland", type: "bar", labels: [], checked: true },
  { name: "Avg DAU all time",            created: "two weeks ago", by: "Allen Gilliland", type: "bar", labels: [2, 4].map(i => props.labels[i]), favorite: true },
  { name: "Max 🐦 velocity by hour",        created: "two weeks ago", by: "Allen Gilliland", type: "line", labels: [] },
  { name: "All the running Quinnie does late at night. Seriously why does he run so late?", created: "two weeks ago", by: "Allen Gilliland", type: "bar", labels: [0].map(i => props.labels[i]), favorite: true },
  { name: "Maz's great saved question",  created: "two weeks ago", by: "Allen Gilliland", type: "line", labels: [2].map(i => props.labels[i]) },
  { name: "A map of many things",        created: "two weeks ago", by: "Allen Gilliland", type: "pin_map", labels: [] },
  { name: "Avg DAU all time",            created: "two weeks ago", by: "Allen Gilliland", type: "line", labels: [] },
  { name: "Max 🐦 velocity by hour",        created: "two weeks ago", by: "Allen Gilliland", type: "line", labels: [2].map(i => props.labels[i]) },
  { name: "All the running Quinnie does late at night. Seriously why does he run so late?", created: "two weeks ago", by: "Allen Gilliland", type: "scalar", labels: [], favorite: true },
]

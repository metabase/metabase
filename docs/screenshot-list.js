export default [
  {
    url: "/",
    imagePath: "test-img/test1",
  },
  {
    url: "/collection/root",
    imagePath: "test-img/test2",
  },
  {
    url: "/question/1",
    imagePath: "docs/metabase-product-screenshot",
    setup: page => [
      page.waitForSelector(".LineAreaBarChart"),
      page.click(".AddButton"),
    ],
  },
  {
    url: "/",
    imagePath: "test-img/search",
    setup: page => [
      page.click("input"),
      page.keyboard.type("Input"),
      page.keyboard.down("Enter"),
    ],
    gif: true,
  },
  {
    url: "/activity",
    imagePath: "docs/images/ActivityFeed",
  },
];

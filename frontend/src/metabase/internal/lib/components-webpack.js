// import all modules in this directory (http://stackoverflow.com/a/31770875)
const componentsReq = require.context(
  "metabase/components",
  true,
  /^(.*\.info\.(js$))[^.]*$/im,
);

const containersReq = require.context(
  "metabase/containers",
  true,
  /^(.*\.info\.(js$))[^.]*$/im,
);

function getComponents(req) {
  return req
    .keys()
    .map(key => Object.assign({}, req(key), { showExample: true }));
}

const components = [
  ...getComponents(componentsReq),
  ...getComponents(containersReq),
];

export default components;

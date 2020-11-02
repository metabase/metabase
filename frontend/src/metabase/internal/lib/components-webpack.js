// import all modules in this directory (http://stackoverflow.com/a/31770875)
const componentsReq = require.context(
  "metabase/components",
  true,
  /^(.*\.info\.(js$))[^.]*$/im,
);

const allComponentsReq = require.context("metabase/components", true);

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

// provide some stats on the total vs total documented components
const documented = getComponents(componentsReq).length;

// get everything and then subtract documented
const total = getComponents(allComponentsReq).length - documented;

export const stats = {
  total,
  documented,
  ratio: total / documented,
};

export default components;

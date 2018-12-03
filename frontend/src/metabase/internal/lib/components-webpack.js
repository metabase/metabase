// import all modules in this directory (http://stackoverflow.com/a/31770875)
const req = require.context(
  "metabase/components",
  true,
  /^(.*\.info\.(js$))[^.]*$/im,
);

export default req
  .keys()
  .map(key => Object.assign({}, req(key), { showExample: true }));

// Inert stand-in for cljs/* under jest.tz.unit.conf.js, which runs without the cljs bundle.
module.exports = {
  currency: [],
  TYPE: {},
  LEVEL_ONE_TYPES: [],
  isa: () => {
    throw new Error("cljs is mocked under jest.tz.unit.conf.js");
  },
};

function mockFullNativeQueryEditor() {
  jest.doMock("metabase/query_builder/components/NativeQueryEditor", () =>
    require("metabase/query_builder/components/NativeQueryEditor/__mocks__/NativeQueryEditor.full"),
  );
}

module.exports = {
  mockFullNativeQueryEditor,
};

import { syncQueryParamsWithURL } from "metabase/parameters/components/Parameters/syncQueryParamsWithURL";

const buildProps = props => ({
  setParameterValue: jest.fn(),
  ...props,
});

const buildPropsForInternalQuestion = props =>
  buildProps({
    commitImmediately: true,
    ...props,
  });

const buildPropsForPublicQuestion = props =>
  buildProps({
    setMultipleParameterValues: jest.fn(),
    ...props,
  });

describe("Parameters", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("syncQueryParamsWithURL", () => {
    describe("for internal questions", () => {
      describe("when parameters length is 0", () => {
        const props = buildPropsForInternalQuestion({
          parameters: [],
          query: {
            createdAt: "2021",
          },
        });

        it("does not try to sync parameters", () => {
          syncQueryParamsWithURL(props);
          expect(props.setParameterValue).not.toHaveBeenCalled();
        });
      });

      describe("when query has no key that matches a parameter slug", () => {
        const props = buildPropsForInternalQuestion({
          parameters: [
            {
              id: "idForslugNotKeyInQuery",
              slug: "slugNotKeyInQuery",
            },
          ],
          query: {
            createdAt: "2021",
          },
        });

        it("does not try to sync parameters", () => {
          syncQueryParamsWithURL(props);
          expect(props.setParameterValue).not.toHaveBeenCalled();
        });
      });

      describe("when parameters length is 1", () => {
        const props = buildPropsForInternalQuestion({
          parameters: [
            {
              id: "idForCreatedAt",
              slug: "createdAt",
            },
          ],
          query: {
            createdAt: "2021",
          },
        });

        it("syncs parameter with query params by slugs in one function call", () => {
          syncQueryParamsWithURL(props);
          expect(props.setParameterValue).toHaveBeenCalledTimes(1);
          expect(props.setParameterValue).toHaveBeenCalledWith(
            "idForCreatedAt",
            "2021",
          );
        });
      });

      describe("when parameters length is 2", () => {
        const props = buildPropsForInternalQuestion({
          parameters: [
            {
              id: "idForCreatedAt",
              slug: "createdAt",
            },
            {
              id: "idForState",
              slug: "state",
            },
          ],
          query: {
            createdAt: "2021",
            state: "CA",
          },
        });

        it("syncs parameter with query params by slugs in as many function calls as there are matching parameters", () => {
          syncQueryParamsWithURL(props);
          expect(props.setParameterValue).toHaveBeenCalledTimes(2);
          expect(props.setParameterValue).toHaveBeenCalledWith(
            "idForCreatedAt",
            "2021",
          );
          expect(props.setParameterValue).toHaveBeenCalledWith(
            "idForState",
            "CA",
          );
        });
      });
    });

    describe("for public questions", () => {
      describe("when parameters length is 0", () => {
        const props = buildPropsForPublicQuestion({
          parameters: [],
          query: {
            createdAt: "2021",
          },
        });

        it("uses empty object as argument when syncing params", () => {
          syncQueryParamsWithURL(props);
          expect(props.setMultipleParameterValues).toHaveBeenCalledTimes(1);
          expect(props.setMultipleParameterValues).toHaveBeenCalledWith({});
        });
      });

      describe("when query has no key that matches a parameter slug", () => {
        const props = buildPropsForPublicQuestion({
          parameters: [
            {
              id: "idForSlugNotKeyInQuery",
              slug: "slugNotKeyInQuery",
            },
          ],
          query: {
            createdAt: "2021",
          },
        });

        it("uses empty object as argument when syncing params", () => {
          syncQueryParamsWithURL(props);
          expect(props.setMultipleParameterValues).toHaveBeenCalledWith({});
        });
      });

      describe("when parameters length is 1", () => {
        const props = buildPropsForPublicQuestion({
          parameters: [
            {
              id: "idForCreatedAt",
              slug: "createdAt",
            },
          ],
          query: {
            createdAt: "2021",
          },
        });

        it("syncs parameter with query params by slugs, by passing one object with as many key/value pairs as there are matching parameters, all in a single function call", () => {
          syncQueryParamsWithURL(props);
          expect(props.setMultipleParameterValues).toHaveBeenCalledTimes(1);
          expect(props.setMultipleParameterValues).toHaveBeenCalledWith({
            idForCreatedAt: "2021",
          });
        });
      });

      describe("when parameters length is 2", () => {
        const props = buildPropsForPublicQuestion({
          parameters: [
            {
              id: "idForCreatedAt",
              slug: "createdAt",
            },
            {
              id: "idForState",
              slug: "state",
            },
          ],
          query: {
            createdAt: "2021",
            state: "CA",
          },
        });

        it("syncs parameter with query params by slugs, by passing one object with as many key/value pairs as there are matching parameters, all in a single function call", () => {
          syncQueryParamsWithURL(props);
          expect(props.setMultipleParameterValues).toHaveBeenCalledTimes(1);
          expect(props.setMultipleParameterValues).toHaveBeenCalledWith({
            idForCreatedAt: "2021",
            idForState: "CA",
          });
        });
      });
    });
  });
});

import { getQuestionParameters } from "./InteractiveAdHocQuestion";

describe("getQuestionParameters", () => {
  it("should generate proper URL params for ad-hoc question", () => {
    const path =
      "/question#eyJuYW1lIjoiTmV3IE9yZGVycyBvdmVyIHRpbWUiLCJkZXNjcmlwdGlvbiI6bnVsbCwiZGF0YXNldF9xdWVyeSI6eyJkYXRhYmFzZSI6MiwicXVlcnkiOnsiYWdncmVnYXRpb24iOltbImNvdW50Il1dLCJicmVha291dCI6W1siZmllbGQiLDUzNCx7InRlbXBvcmFsLXVuaXQiOiJtb250aCJ9XV0sImZpbHRlciI6WyJiZXR3ZWVuIixbImZpZWxkIiw1MzQseyJiYXNlLXR5cGUiOiJ0eXBlL0RhdGVUaW1lV2l0aExvY2FsVFoiLCJ0ZW1wb3JhbC11bml0IjoibW9udGgifV0sIjIwMjEtMDUtMDFUMDA6MDBaIiwiMjAyMi0wOC0wMVQwMDowMFoiXSwic291cmNlLXRhYmxlIjoiY2FyZF9fOTMifSwidHlwZSI6InF1ZXJ5In0sImRpc3BsYXkiOiJsaW5lIiwiZGlzcGxheUlzTG9ja2VkIjp0cnVlLCJ2aXN1YWxpemF0aW9uX3NldHRpbmdzIjp7ImdyYXBoLmNvbG9ycyI6WyIjOEFDRkU2Il0sImdyYXBoLmRpbWVuc2lvbnMiOlsiY3JlYXRlZF9hdCJdLCJncmFwaC5tZXRyaWNzIjpbImNvdW50Il0sImdyYXBoLnNlcmllc19sYWJlbHMiOltudWxsXX0sIm9yaWdpbmFsX2NhcmRfaWQiOjEwNn0=";

    expect(getQuestionParameters(path)).toEqual({
      location: {
        search: "",
        hash: "#eyJuYW1lIjoiTmV3IE9yZGVycyBvdmVyIHRpbWUiLCJkZXNjcmlwdGlvbiI6bnVsbCwiZGF0YXNldF9xdWVyeSI6eyJkYXRhYmFzZSI6MiwicXVlcnkiOnsiYWdncmVnYXRpb24iOltbImNvdW50Il1dLCJicmVha291dCI6W1siZmllbGQiLDUzNCx7InRlbXBvcmFsLXVuaXQiOiJtb250aCJ9XV0sImZpbHRlciI6WyJiZXR3ZWVuIixbImZpZWxkIiw1MzQseyJiYXNlLXR5cGUiOiJ0eXBlL0RhdGVUaW1lV2l0aExvY2FsVFoiLCJ0ZW1wb3JhbC11bml0IjoibW9udGgifV0sIjIwMjEtMDUtMDFUMDA6MDBaIiwiMjAyMi0wOC0wMVQwMDowMFoiXSwic291cmNlLXRhYmxlIjoiY2FyZF9fOTMifSwidHlwZSI6InF1ZXJ5In0sImRpc3BsYXkiOiJsaW5lIiwiZGlzcGxheUlzTG9ja2VkIjp0cnVlLCJ2aXN1YWxpemF0aW9uX3NldHRpbmdzIjp7ImdyYXBoLmNvbG9ycyI6WyIjOEFDRkU2Il0sImdyYXBoLmRpbWVuc2lvbnMiOlsiY3JlYXRlZF9hdCJdLCJncmFwaC5tZXRyaWNzIjpbImNvdW50Il0sImdyYXBoLnNlcmllc19sYWJlbHMiOltudWxsXX0sIm9yaWdpbmFsX2NhcmRfaWQiOjEwNn0=",
        pathname: "/question",
      },
      params: {},
    });
  });

  it("should generate proper URL params for a saved question", () => {
    const path = "/question/109-days-when-orders-were-added";

    expect(getQuestionParameters(path)).toEqual({
      location: {
        search: "",
        hash: "",
        pathname: "/question/109-days-when-orders-were-added",
      },
      params: { slug: "109-days-when-orders-were-added" },
    });
  });
});

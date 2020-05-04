import { getForm } from "metabase/entities/containers/EntityForm";

const firstName = {
  name: "first_name",
  placeholder: "FirstName",
};

const SINGLE_FORM_DEF = {
  form: {
    fields: [firstName],
  },
};

const MULTIPLE_FORM_DEF = {
  forms: {
    user: {
      fields: [firstName],
    },
    admin: {
      fields: [
        firstName,
        {
          name: "secret",
          placeholder: "Secret",
        },
      ],
    },
  },
};

describe("getForm", () => {
  describe("one form", () => {
    it("should grab the default form from the entity", () => {
      const result = getForm(SINGLE_FORM_DEF);
      expect(result.fields.length).toBe(1);
    });
  });
  describe("multiple forms", () => {
    it("should pick the first form", () => {
      const result = getForm(MULTIPLE_FORM_DEF);
      expect(result.fields.length).toBe(1);
    });
  });
});

import React from "react";
import { shallow, mount } from "enzyme";

import {
  QuestionIndex,
  CollectionEmptyState,
  NoSavedQuestionsState,
  QuestionIndexHeader,
} from "../../src/metabase/questions/containers/QuestionIndex";

const someQuestions = [{}, {}, {}];
const someCollections = [{}, {}];

const dummyFunction = () => {};

const getQuestionIndex = ({ questions, collections, isAdmin }) => (
  <QuestionIndex
    questions={questions}
    collections={collections}
    isAdmin={isAdmin}
    replace={dummyFunction}
    push={dummyFunction}
    location={dummyFunction}
    search={dummyFunction}
    loadCollections={dummyFunction}
  />
);

describe("QuestionIndex", () => {
  describe("info box about collections", () => {
    it("should be shown to admins if no collections", () => {
      const component = shallow(
        getQuestionIndex({
          questions: null,
          collections: null,
          isAdmin: true,
        }),
      );

      expect(component.find(CollectionEmptyState).length).toEqual(1);

      const component2 = shallow(
        getQuestionIndex({
          questions: someQuestions,
          collections: null,
          isAdmin: true,
        }),
      );

      expect(component2.find(CollectionEmptyState).length).toEqual(1);
    });

    it("should not be shown to admins if there are collections", () => {
      const component = shallow(
        getQuestionIndex({
          questions: null,
          collections: someCollections,
          isAdmin: false,
        }),
      );

      expect(component.find(CollectionEmptyState).length).toEqual(0);
    });

    it("should not be shown to non-admins", () => {
      const component = shallow(
        getQuestionIndex({
          questions: null,
          collections: null,
          isAdmin: false,
        }),
      );

      expect(component.find(CollectionEmptyState).length).toEqual(0);
    });
  });

  describe("no saved questions state", () => {
    const eitherAdminOrNot = [true, false];

    it("should be shown if no collections or questions", () => {
      eitherAdminOrNot.forEach(isAdmin => {
        const component = shallow(
          getQuestionIndex({
            questions: null,
            collections: null,
            isAdmin,
          }),
        );

        expect(component.find(NoSavedQuestionsState).length).toEqual(1);
      });
    });

    it("should not be shown otherwise", () => {
      eitherAdminOrNot.forEach(isAdmin => {
        const component = shallow(
          getQuestionIndex({
            questions: someQuestions,
            collections: null,
            isAdmin,
          }),
        );

        expect(component.find(NoSavedQuestionsState).length).toEqual(0);

        const component2 = shallow(
          getQuestionIndex({
            questions: null,
            collections: someCollections,
            isAdmin,
          }),
        );

        expect(component2.find(NoSavedQuestionsState).length).toEqual(0);
      });
    });
  });

  describe("collection actions", () => {
    it("should let admins change permissions if collections exist", () => {
      const component = mount(
        <QuestionIndexHeader collections={someCollections} isAdmin={true} />,
      );

      // Why `find` does not work for matching React props: https://github.com/airbnb/enzyme/issues/582
      expect(
        component.findWhere(
          node => node.prop("to") === "/collections/permissions",
        ).length,
      ).toEqual(1);
    });

    it("should not let admins change permissions if no collections", () => {
      const component = mount(
        <QuestionIndexHeader collections={null} isAdmin={true} />,
      );

      expect(
        component.findWhere(
          node => node.prop("to") === "/collections/permissions",
        ).length,
      ).toEqual(0);
    });

    it("should not let non-admins change permissions", () => {
      const component = mount(
        <QuestionIndexHeader collections={someCollections} isAdmin={false} />,
      );

      expect(
        component.findWhere(
          node => node.prop("to") === "/collections/permissions",
        ).length,
      ).toEqual(0);
    });
  });
});

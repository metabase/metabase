import React from "react";
import { render, fireEvent } from "@testing-library/react";

import _ from "underscore";

import { delay } from "metabase/lib/promise";

import {
  SAMPLE_DATASET,
  ANOTHER_DATABASE,
  MULTI_SCHEMA_DATABASE,
  OTHER_MULTI_SCHEMA_DATABASE,
  metadata,
  makeMetadata,
  state as fixtureData,
} from "__support__/sample_dataset_fixture";

import { ExpressionPopover as ep } from "metabase/query_builder/components/ExpressionPopover";

describe("ExpressionPopover", () => {

  it("should refresh every time someone keystrokes", () => {
    const onChange = jest.fn();
    const isValid = jest.fn();
    const invalidExp = jest.fn();
    const validExp = jest.fn();
    const query = jest.fn();
    const title = "test title"
    const { getByText, queryByText } = render(
      <ExpressionPopover
          title={title}
          query={query}
          expression={filter ? filter.raw() : null}
          startRule="boolean"
          isValid={filter && filter.isValid()}
          onChange={onChange}
        />
    );

    // simulate good exp
    // check
    // simulate bad exp
    // check
  });
}

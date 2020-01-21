/* @flow */

import React from "react";
import { jt } from "ttag";
import { isFK, isPK } from "metabase/lib/types";
import { singularize, stripId } from "metabase/lib/formatting";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase/meta/types/Visualization";

function getCustomDrill(column) {
  if (column.settings && column.settings.custom_actions) {
    return { name: "page", url: column.settings.custom_actions.url };
  } else if (isFK(column.special_type)) {
    //FIXME how to access metadata of target column?
  }

  return null;
}

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  const query = question.query();
  if (
    !(query instanceof StructuredQuery) ||
    !clicked ||
    !clicked.column ||
    clicked.column.id == null ||
    clicked.value == undefined
  ) {
    return [];
  }

  const { value, column } = clicked;
  const customDrill = getCustomDrill(column);

  if (!customDrill) {
    return [];
  }

  return [
    {
      name: "custom-url",
      section: "custom",
      title: (
        <span>
          {jt`View this ${singularize(
            isPK(column.special_type) ? query.table().display_name : stripId(column.display_name),
          )}'s ${customDrill.name}`}
        </span>
      ),
      url: () => {
        // FIXME Use rfc6570 implementation
        return customDrill.url.replace('{value}', value);
      },
    },
  ];
};

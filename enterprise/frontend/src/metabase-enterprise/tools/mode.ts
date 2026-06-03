import { push } from "react-router-redux";
import { t } from "ttag";

import { card } from "metabase/urls";
import type { ClickObject } from "metabase-lib/v1/queries/drills/types";

const CARD_ID_ROW_IDX = 0;

type ErrorDrillProps = {
  clicked?: ClickObject;
};

const ErrorDrill = ({ clicked }: ErrorDrillProps) => {
  if (!clicked?.origin) {
    return [];
  }

  const cardId = Number(clicked.origin.row[CARD_ID_ROW_IDX]);

  return [
    {
      name: "detail",
      title: t`View this`,
      default: true,
      action() {
        return push(card({ id: cardId }));
      },
    },
  ];
};

export const ErrorMode = {
  name: "error",
  fallback: (props: ErrorDrillProps) => ErrorDrill(props),
};

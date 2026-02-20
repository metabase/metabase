import { t } from "ttag";

import { question } from "metabase/lib/urls";
import { routerActions } from "metabase/routing/compat/react-router-redux";

const CARD_ID_ROW_IDX = 0;

const ErrorDrill = ({ clicked }) => {
  if (!clicked) {
    return [];
  }

  const cardId = clicked.origin.row[CARD_ID_ROW_IDX];

  return [
    {
      name: "detail",
      title: t`View this`,
      default: true,
      action() {
        return routerActions.push(question({ id: cardId }));
      },
    },
  ];
};

export const ErrorMode = {
  name: "error",
  fallback: (props) => ErrorDrill(props),
};

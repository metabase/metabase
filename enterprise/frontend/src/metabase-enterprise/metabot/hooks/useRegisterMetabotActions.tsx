import { useRegisterActions } from "kbar";
import { useMemo } from "react";
import { t } from "ttag";

import { MetabotIcon } from "../components/MetabotIcon";

import { useMetabotAgent } from "./useMetabotAgent";

export function useRegisterMetabotActions({
  searchQuery,
}: {
  searchQuery: string;
}) {
  const { setVisible, submitInput } = useMetabotAgent();

  const metabotActions = useMemo(
    () => [
      {
        id: `metabot`,
        name: searchQuery
          ? t`Ask Metabot, “${searchQuery}”`
          : t`Ask me to do something, or ask me a question`,
        icon: "metabot",
        section: "metabot",
        perform: async () => {
          setVisible(true);
          if (searchQuery) {
            submitInput(searchQuery);
          }
        },
        extra: {
          iconComponent: () => (
            <MetabotIcon
              isLoading={false}
              style={{ marginTop: -2, flexBasis: 20, height: 20 }}
            />
          ),
          nameTextStyles: {
            fontStyle: searchQuery ? "normal" : "italic",
            fontWeight: "normal",
          },
        },
      },
    ],
    [searchQuery, setVisible, submitInput],
  );

  useRegisterActions(metabotActions, [metabotActions]);
}

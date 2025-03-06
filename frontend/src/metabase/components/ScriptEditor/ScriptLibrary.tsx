/* eslint-ignore no-restricted-imports -- for hackathon velocity */

import { Text, Flex, Stack, Icon, NavLink } from "metabase/ui";
import { createLowlight } from "lowlight";
import ts from "highlight.js/lib/languages/typescript";
import { Dispatch, SetStateAction } from "react";
import { Script } from "./types";
import S from "./ScriptEditor.module.css";
import _ from "underscore";

const lowlight = createLowlight();

lowlight.register({ ts });

type PromiseMetadata = {
  value: any;
  status: string;
  description: string;
};

export const ScriptLibrary = ({
  setCurrentScriptId,
  scripts,
  setScripts,
}: {
  setCurrentScriptId: Dispatch<SetStateAction<number | null>>;
  scripts: Script[];
  setScripts: Dispatch<SetStateAction<Script[]>>;
}) => {
  const sortedScripts = _.sortBy(scripts, script => script.name);
  return (
    <Stack gap={0}>
      {sortedScripts.map(script => {
        return (
          <NavLink
            className={S.ScriptNavLink}
            label={
              <Flex justify="space-between" align="center">
                <Text>{script.name}</Text>
                <Icon name="chevronright" />
              </Flex>
            }
            key={script.name}
            p="md"
            onClick={() => setCurrentScriptId(script.id)}
          ></NavLink>
        );
      })}
    </Stack>
  );
};

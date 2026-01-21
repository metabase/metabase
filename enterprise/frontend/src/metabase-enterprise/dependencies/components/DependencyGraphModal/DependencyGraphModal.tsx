import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Flex, Modal } from "metabase/ui";
import type { DependencyEntry } from "metabase-types/api";

import { DependencyGraph } from "../DependencyGraph";

type Props = {
  entry: DependencyEntry;
  opened: boolean;
  onClose: () => void;
};

export function DependencyGraphModal({ entry, opened, onClose }: Props) {
  return (
    <Modal.Root size="calc(100vw - 4rem)" opened={opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content mah="calc(100vh - 4rem)">
        <Modal.Header>
          <Modal.Title>{t`Dependency graph`}</Modal.Title>
          <Flex justify="flex-end">
            <Modal.CloseButton />
          </Flex>
        </Modal.Header>
        <Modal.Body p={0} h="calc(100vh - 10rem)">
          <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
            value={{
              baseUrl: Urls.dependencyGraph({ entry }),
              defaultEntry: entry,
            }}
          >
            <DependencyGraph
              entry={entry}
              getGraphUrl={(e) => Urls.dependencyGraph({ entry: e })}
              withEntryPicker={false}
            />
          </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

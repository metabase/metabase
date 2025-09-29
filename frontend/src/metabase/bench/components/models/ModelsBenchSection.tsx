import { useState } from "react";
import { t } from "ttag";

import {
  useFilteredModels,
  useModelFilterSettings,
} from "metabase/browse/models/BrowseModels";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Box, Center, Group } from "metabase/ui";

import { ModelsList } from "./ModelsList";

export const ModelsBenchSection = () => {
  const [selectedItem, setSelectedItem] = useState(null);
  const [modelFilters, setModelFilters] = useModelFilterSettings();
  const { isLoading, error, models } = useFilteredModels(modelFilters);

  return (
    <Group>
      <DelayedLoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ flex: 1 }}
        loader={<ModelsList skeleton />}
      >
        <ModelsList models={models} />
      </DelayedLoadingAndErrorWrapper>

      <Box>
        {selectedItem ? (
          <div>MODEL CONTENT</div>
        ) : (
          <Center>
            {t`Select a model to view its definition and results`}
          </Center>
        )}
      </Box>
    </Group>
  );
};

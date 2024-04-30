import { useEffect, useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { Flex, Group, Icon, Title } from "metabase/ui";

import type { ActualModelFilters } from "../utils";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection
} from "./BrowseApp.styled";
import { BrowseModelsBody } from "./BrowseModelsBody";

const { useModelFilterSettings } = PLUGIN_CONTENT_VERIFICATION;

export const BrowseModels = () => {
  const initialModelFilters = useModelFilterSettings();

  const [actualModelFilters, setActualModelFilters] =
    useState<ActualModelFilters>(initialModelFilters);

  useEffect(() => {
    setActualModelFilters(initialModelFilters);
  }, [initialModelFilters, setActualModelFilters]);

  return (
    <BrowseContainer>
      <BrowseHeader>
        <BrowseSection>
          <Flex w="100%" direction="row" justify="space-between" align="center">
            <Title order={1} color="text-dark">
              <Group spacing="sm">
                <Icon size={18} color={color("brand")} name="model" />
                {t`Models`}
              </Group>
            </Title>
            <PLUGIN_CONTENT_VERIFICATION.ModelFilterControls
              actualModelFilters={actualModelFilters}
              setActualModelFilters={setActualModelFilters}
            />
          </Flex>
        </BrowseSection>
      </BrowseHeader>
      <BrowseMain>
        <BrowseSection>
          <BrowseModelsBody actualModelFilters={actualModelFilters} />
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};

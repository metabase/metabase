/* eslint-disable react/prop-types */
import { Switch } from "@mantine/core";
import { t } from "ttag";
import type { SearchFilterToggle } from "metabase/search/types";
import { Text, Group } from "metabase/ui";

export const VerifiedFilterDisplay: SearchFilterToggle<"verified">["Component"] =
  ({ value, onChange, "data-testid": dataTestId }) => {
    return (
      <Group noWrap px="0.25rem" py="0.5rem" data-testid={dataTestId}>
        <Text w="100%" c="text.1" fw={700}>{t`Verified items only`}</Text>
        <Switch
          wrapperProps={{
            "data-testid": "verified-filter-switch",
          }}
          size="sm"
          checked={Boolean(value)}
          onChange={event =>
            onChange(event.currentTarget.checked ? true : undefined)
          }
        />
      </Group>
    );
  };

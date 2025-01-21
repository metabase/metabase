import { jt, t } from "ttag";

import Link from "metabase/core/components/Link";
import * as Urls from "metabase/lib/urls";
import { Group, Icon, Paper, Stack, Title } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import ModelActionDetails from "./ModelActionDetails";

interface Props {
  model: Question;
  shouldShowActionsUI: boolean;
}

function ModelActions({ model, shouldShowActionsUI }: Props) {
  return (
    <Stack p="3rem 4rem" mih="90vh">
      {shouldShowActionsUI ? (
        <Stack spacing="lg">
          <Title>
            <Group spacing="sm">
              {jt`Actions for ${(
                <Group spacing="xs">
                  <Icon name="model" size={24} />
                  <Link variant="brand" to={Urls.model({ id: model.id() })}>
                    {model.displayName()}
                  </Link>
                </Group>
              )}`}
            </Group>
          </Title>
          <Paper p="lg">
            <ModelActionDetails model={model} />
          </Paper>
        </Stack>
      ) : (
        <>{t`Actions are not enabled for this model.`}</>
      )}
    </Stack>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelActions;

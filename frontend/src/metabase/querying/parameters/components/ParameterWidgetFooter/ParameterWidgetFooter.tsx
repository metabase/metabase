import { Button, Flex } from "metabase/ui";

import S from "./ParameterWidgetFooter.module.css";

type ParameterWidgetFooterProps = {
  submitButtonLabel?: string;
};

export function ParameterWidgetFooter({
  submitButtonLabel,
}: ParameterWidgetFooterProps) {
  return (
    <Flex className={S.footer} p="md" justify="flex-end">
      <Button type="submit" variant="filled">
        {submitButtonLabel}
      </Button>
    </Flex>
  );
}

import { Button, Flex } from "metabase/ui";

import S from "./WidgetFooter.module.css";

type WidgetFooterProps = {
  submitButtonLabel?: string;
};

export function WidgetFooter({ submitButtonLabel }: WidgetFooterProps) {
  return (
    <Flex className={S.footer} p="md" justify="flex-end">
      <Button type="submit" variant="filled">
        {submitButtonLabel}
      </Button>
    </Flex>
  );
}

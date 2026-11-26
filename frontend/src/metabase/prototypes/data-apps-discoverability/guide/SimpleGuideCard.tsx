import GuidePageS from "metabase/data-studio/guide/pages/GuidePage/GuidePage.module.css";
import { Box, Card, Stack, Title } from "metabase/ui";

import { SIMPLE_GUIDE_TITLE, SimpleGuideBody } from "./SimpleGuideLayout";

/**
 * PROTOTYPE: the simple guide for Data Studio, framed like the Data Studio guide page: a title above a bordered card.
 */
export function SimpleGuideCard() {
  return (
    <Box className={GuidePageS.content}>
      <Title mb="xxl" order={2}>
        {SIMPLE_GUIDE_TITLE}
      </Title>
      <Card shadow="none" withBorder>
        <Stack className={GuidePageS.cardContent} gap="md">
          <SimpleGuideBody />
        </Stack>
      </Card>
    </Box>
  );
}

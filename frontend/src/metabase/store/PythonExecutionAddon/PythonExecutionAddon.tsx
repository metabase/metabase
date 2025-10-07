import { useDisclosure } from "@mantine/hooks";
import { c, t } from "ttag";

import { UpsellPythonTransforms } from "metabase/admin/upsells/UpsellPythonTransforms";
import { formatNumber } from "metabase/lib/formatting";
import { getSubpathSafeUrl } from "metabase/lib/urls";
import {
  Box,
  Button,
  Flex,
  Image,
  Modal,
  Stack,
  Text,
  Title,
} from "metabase/ui";

export const PythonExecutionAddon = () => {
  const [isModalOpen, { open: openModal, close }] = useDisclosure(false);

  const MONTHLY_PRICE = 150; // FIXME: Get from the API
  const YEARLY_PRICE = 1620; // FIXME: Get from the API

  const formattedPrice = (price: number) =>
    formatNumber(price, {
      currency: "USD",
      number_style: "currency",
      maximumFractionDigits: 0,
    });

  const description = c("{0} is a monthly USD price, {1} is a yearly USD price")
    .jt`${formattedPrice(MONTHLY_PRICE)}/month (${formattedPrice(YEARLY_PRICE)}/ year on the yearly plan) will be added to your next billing period. You can cancel the add-on anytime.`;

  const illustration = getSubpathSafeUrl(
    "app/assets/img/python-transforms-illustration.svg",
  );

  return (
    <Flex mx="auto" pt="xl" w="100%" justify="center">
      <UpsellPythonTransforms source="foo" onClick={openModal} />
      <Modal opened={isModalOpen} onClose={close}>
        <Stack
          maw={360}
          m="0 auto"
          ta="center"
          gap="lg"
          align="center"
          pb={64}
          pt="md"
        >
          <Image src={illustration} w={96} />
          <Box>
            <Title order={2} size="lg" mb="sm">{t`Add Python Execution`}</Title>
            <Text lh={1.5}>{description}</Text>
          </Box>
          <Button variant="filled">{t`Confirm purchase`}</Button>
        </Stack>
      </Modal>
    </Flex>
  );
};

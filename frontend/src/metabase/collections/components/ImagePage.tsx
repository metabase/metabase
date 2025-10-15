import { Box, Flex, Image, Title, Icon, Menu, Button, Loader, Center } from "metabase/ui";
import { skipToken, useGetImageDataQuery } from "metabase/api";

export const ImagePage = ({ params: { id }}: { params: { id: number }}) => {
  const { data, isLoading } = useGetImageDataQuery(id ? { id } : skipToken);

  if (isLoading || !data || !data?.url) {
    return (
      <Box p="xl">
        <Center>
          <Loader />
        </Center>
      </Box>
    );
  }
  const { url, title } = data;


  return (
    <Box p="xl" px="3rem">
      <Flex
        mb="lg" align="center" justify="space-between" gap="md" pb="lg"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Title order={3}>{title}</Title>
        <Menu position="bottom-end">
          <Menu.Target>
            <Button variant="subtle">
              <Icon name="ellipsis" />
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => {}}>Move</Menu.Item>
            <Menu.Item onClick={() => {}}>Rename</Menu.Item>
            <Menu.Item onClick={() => {}}>Share</Menu.Item>
            <Menu.Item onClick={() => {}}>Download</Menu.Item>
            <Menu.Item onClick={() => {}}>Delete</Menu.Item>
            <Menu.Divider />
            <Menu.Item onClick={() => {}}>Set as Vamsi's profile picture</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Flex>
      <Box>
        {/** if this had a card id, link to the card */}
        <Image
          src={url}
          alt={title}
          bdrs="md"
          mah="70vh"
          style={{ objectFit: "contain" }}
          mx="auto"
        />
      </Box>
    </Box>
  )
}

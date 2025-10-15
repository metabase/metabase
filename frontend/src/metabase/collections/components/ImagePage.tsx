import { Box, Flex, Image, Title, Icon, Menu, Button, Loader, Center } from "metabase/ui";
import { skipToken, useGetImageDataQuery } from "metabase/api";

export const ImagePage = ({ params: { id }}: { params: { id: number }}) => {
  const { data, isLoading } = useGetImageDataQuery(id ? { id } : skipToken);

  // if (isLoading || !data || !data?.image_url) {
  //   return (
  //     <Box p="xl">
  //       <Center>
  //         <Loader />
  //       </Center>
  //     </Box>
  //   );
  // }
  // const { image_url, name } = data;

  const image_url = "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExOGI4bTRtdzRvYXMxaHd5aTdvZjF5eGZmNGx2bmM4ZTZkcGk2a2lldSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/vpawfuA6LnYeQ/giphy.gif";
  const name = "Vamsi's profile picture";

  return (
    <Box p="xl">
      <Flex
        mb="lg" align="center" justify="space-between" gap="md" pb="lg"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Title order={3}>{name}</Title>
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
        <Image
          src={image_url}
          alt={name}
          bdrs="md"
        />
      </Box>
    </Box>
  )
}

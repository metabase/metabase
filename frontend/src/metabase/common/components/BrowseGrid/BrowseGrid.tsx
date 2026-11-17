import { SimpleGrid, type SimpleGridProps } from "metabase/ui";

export const BrowseGrid = (props: SimpleGridProps) => (
  <SimpleGrid
    cols={{ "10rem": 1, "20rem": 2, "50rem": 3 }}
    w="100%"
    type="container"
    {...props}
  />
);

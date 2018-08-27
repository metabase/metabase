import React from "react";
import { Box, Flex } from "grid-styled";

import Icon from "metabase/components/Icon";

const TableStyles = {
  base: {
    header: {
      fontWeight: 900,
      textAlign: "left",
    },
    row: {},
    types: {
      integer: {
        textAlign: "right",
      },
    },
  },
  compact: {
    padding: 1,
    header: {
      padding: {
        x: 1,
        y: 0,
      },
    },
  },
  normal: {
    padding: 2,
    header: {
      padding: {
        x: 2,
        y: 2,
      },
    },
  },
  comfortable: {
    padding: 3,
    header: {
      padding: {
        x: 2,
        y: 2,
      },
    },
  },
};

const SampleData = [
  { id: 1 },
  { id: 2 },
  { id: 3 },
  { id: 4 },
  { id: 5 },
  { id: 6 },
  { id: 7 },
  { id: 8 },
  { id: 9 },
  { id: 10 },
  { id: 11 },
  { id: 12 },
];

const COLUMNS = ["id", "avatar_url", "name", "address", "spent"];

const ColumnFields = {
  id: {
    name: "ID",
  },
  avatar_url: {
    baseType: "string",
  },
  name: {
    name: "Name",
  },
  address: {
    name: "Address",
    baseType: "string",
  },
  spent: {
    name: "Spent",
    baseType: "float",
  },
  viewed: {
    name: "Views",
    baseType: "integer",
  },
};

const SortIndicator = () => (
  <Flex flexDirection="column">
    <Icon name="chevronup" size={6} />
    <Icon name="chevrondown" size={6} />
  </Flex>
);

const ColumnHeader = ({ field, variant }) => (
  <Box
    px={TableStyles[variant].header.padding.x}
    py={TableStyles[variant].header.padding.x}
    style={{ ...TableStyles.base.header }}
  >
    <Flex
      align="center"
      className="hover-parent hover--visibility cursor-pointer text-brand-hover"
    >
      <Box mr={1}>{field.name}</Box>
      <Box className="hover-child">
        <SortIndicator />
      </Box>
    </Flex>
  </Box>
);

const Row = ({ row }) => {
  console.log(row);
  return <Box>ROW</Box>;
};

class TableApp extends React.Component {
  state = {
    density: "normal",
  };

  render() {
    const { density } = this.state;
    return (
      <Box p={2} w="100%">
        <Flex align="center" ml="auto">
          <Box onClick={() => this.setState({ density: "compact" })}>
            Compact
          </Box>
          <Box onClick={() => this.setState({ density: "normal" })}>Normal</Box>
          <Box onClick={() => this.setState({ density: "comfortable" })}>
            Comfortable
          </Box>
        </Flex>
        <Box className="bordered rounded shadowed" w="100%" mt={3}>
          <Flex align="center" p={TableStyles[density].padding}>
            {COLUMNS.map(c => (
              <ColumnHeader field={ColumnFields[c]} variant={density} />
            ))}
          </Flex>
          <Box>{SampleData.map(d => <Row row={d} />)}</Box>
        </Box>
      </Box>
    );
  }
}

export default TableApp;

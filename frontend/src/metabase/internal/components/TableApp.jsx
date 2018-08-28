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
    cell: {},
  },
};

const SampleData = [
  { id: 1, name: "Kyle", address: "420 Cool St", spent: "100.11" },
  {
    id: 2,
    name: "Maz",
    address: "Whatever the giants stadium address is",
    spent: 220,
  },
  { id: 3, name: "Cam", address: "11 Birds Nest Way", spent: 300 },
];

const COLUMNS = ["id", "avatar_url", "name", "address", "spent"];

const ColumnFields = {
  id: {
    name: "ID",
  },
  avatar_url: {
    name: "Avatar",
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
  <th>
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
  </th>
);

const ColumnCell = ({ cell, variant }) => (
  <Box
    px={TableStyles[variant].header.padding.x}
    py={TableStyles[variant].header.padding.x}
    style={{ ...TableStyles.base.cell }}
  >
    {cell}
  </Box>
);

const Row = ({ row, variant }) => {
  return (
    <tr>
      {COLUMNS.map(c => (
        <td>
          <ColumnCell cell={row[c]} variant={variant} />
        </td>
      ))}
    </tr>
  );
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
          <table>
            <thead align="center" p={TableStyles[density].padding}>
              {COLUMNS.map(c => (
                <ColumnHeader field={ColumnFields[c]} variant={density} />
              ))}
            </thead>
            <tbody>
              {SampleData.map(d => <Row row={d} variant={density} />)}
            </tbody>
          </table>
        </Box>
      </Box>
    );
  }
}

export default TableApp;

import React from "react";
import { Box, Flex } from "grid-styled";
import colors from "metabase/lib/colors";

import ProgressBar from "metabase/components/ProgressBar";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

const COLUMNS = [
  "id",
  "avatar_url",
  "name",
  "address",
  "spent",
  "histogram",
  "views",
  "change",
  "created",
  "data",
  "email",
  "zip",
  "city",
  "state",
];

const UNIFIED_COLUMNS = [
  "unifiedUser",
  "unifiedAddress",
  "spent",
  "views",
  "change",
  "created",
  "data",
];

const ColumnFields = {
  id: {
    name: "ID",
    baseType: "integer",
  },
  avatar_url: {
    name: "Avatar",
    baseType: "string",
    specialType: "avatar",
  },
  name: {
    name: "Name",
    baseType: "string",
  },
  address: {
    name: "Address",
    baseType: "address",
    specialType: "address",
  },
  spent: {
    name: "Spent",
    baseType: "float",
    specialType: "currency",
    typeSettings: {
      currencySymbol: "£",
    },
  },
  views: {
    name: "Views",
    baseType: "integer",
  },
  created: {
    name: "Created",
    baseType: "date",
  },
  data: {
    name: "Raw record",
    baseType: "json",
  },
  histogram: {
    name: "histogram",
    baseType: "integer",
    specialType: "histogram",
    hideLabel: true,
  },
  change: {
    name: "change",
    baseType: "integer",
    specialType: "change",
    hideLabel: true,
  },
  unifiedUser: {
    name: "User",
    specialType: "unifiedUser",
    unifiedFields: ["name", "avatar_url", "email"],
  },
  unifiedAddress: {
    name: "Address",
    specialType: "unifiedAddress",
    unifiedFields: ["address", "city", "state", "zip"],
  },
  email: {
    name: "Email",
  },
  state: {
    name: "State",
  },
  city: {
    name: "City",
  },
  zip: {
    name: "Zipcode",
  },
};

const SortIndicator = () => (
  <Flex flexDirection="column">
    <Icon name="chevronup" size={6} />
    <Icon name="chevrondown" size={6} />
  </Flex>
);

const Avatar = ({ cell, field, variant }) => {
  let size;
  switch (variant) {
    case "comfortable":
      size = 40;
      break;
    case "compact":
      size = 22;
      break;
    default:
      size = 32;
  }
  return (
    <Box
      px={variant && TableStyles[variant].header.padding.x}
      py={variant && TableStyles[variant].header.padding.y}
    >
      <Box
        w={`${size}px`}
        style={{
          borderRadius: 99,
          backgroundColor: "red",
          height: size,
          overflow: "hidden",
        }}
      >
        <img src={`http://placekitten.com/g/${size}/${size}`} />
      </Box>
    </Box>
  );
};

const ColumnHeader = ({ field, variant }) => (
  <th>
    {!field.hideLabel && (
      <Box
        px={TableStyles[variant].header.padding.x}
        py={TableStyles[variant].header.padding.y}
        style={{
          ...TableStyles.base.header,
          ...TableStyles.base.types[field.baseType],
        }}
      >
        <Flex
          align="center"
          className="hover-parent hover--visibility cursor-pointer text-brand-hover"
          flexDirection={
            field.baseType === "integer" || field.baseType === "float"
              ? "row-reverse"
              : "row"
          }
          style={{ textAlign: "inherit" }}
        >
          <Box mr={1}>{field.name}</Box>
          <Box className="hover-child">
            <SortIndicator />
          </Box>
        </Flex>
      </Box>
    )}
  </th>
);

const AddressField = ({ cell, variant, field }) => (
  <Flex
    align="center"
    px={variant && TableStyles[variant].header.padding.x}
    py={variant && TableStyles[variant].header.padding.y}
  >
    {variant != "compact" && <Icon name="location" mx="6px" color="#d1d8de" />}
    {cell}
  </Flex>
);

const Currency = ({ cell, variant, field }) => (
  <Box
    px={variant && TableStyles[variant].header.padding.x}
    py={variant && TableStyles[variant].header.padding.y}
    style={{
      fontWeight: 700,
      fontSize: 12.5,
      textAlign: "right",
      color: cell > 0 ? "inherit" : "#949798",
    }}
  >
    {cell > 0 && (
      <span style={{ marginRight: 4 }}>
        {field.typeSettings.currencySymbol}
      </span>
    )}
    {cell}
  </Box>
);

const Change = ({ cell, variant, field }) => (
  <Flex
    px={TableStyles[variant].header.padding.x - 1}
    py={TableStyles[variant].header.padding.y}
    color={cell > 0 ? colors["success"] : colors["error"]}
    style={{ textAlign: "left", fontWeight: 900, fontSize: 10 }}
    align="center"
  >
    <Icon name={cell > 0 ? "chevronup" : "chevrondown"} size={10} mr="6px" />
    {cell}%
  </Flex>
);

const JsonCell = ({ cell, variant, column }) => {
  return (
    <Box
      px={TableStyles[variant].header.padding.x - 1}
      py={TableStyles[variant].header.padding.y}
    >
      <Icon name="json" />
    </Box>
  );
};

const Histogram = ({ cell, variant, column }) => {
  return (
    <Box className="relative overflow-hidden" w="60px">
      <ProgressBar percentage={cell * 0.01} height={6} />
    </Box>
  );
};

const UnifiedAddress = ({ cell, variant, column, row }) => (
  <Box
    px={TableStyles[variant].header.padding.x}
    py={TableStyles[variant].header.padding.y}
  >
    <Flex align="center">
      {variant !== "compact" && <Icon name="location" mr={1} size={14} />}
      <Box>
        <Box style={{ fontWeight: 700 }}>{row["address"]}</Box>
        <Box
          style={{ textTransform: "uppercase", fontSize: 11, fontWeight: 700 }}
        >
          {row["city"]},{row["state"]}
          {row["zip"]}
        </Box>
      </Box>
    </Flex>
  </Box>
);

const UnifiedUser = ({ variant, column, row }) => (
  <Box
    px={TableStyles[variant].header.padding.x}
    py={TableStyles[variant].header.padding.y}
  >
    <Link to={row["id"]} className="link">
      <Flex align="center">
        {variant !== "compact" && (
          <Box mr={1}>
            <Avatar />
          </Box>
        )}
        <Box>
          <Box style={{ fontWeight: 900 }}>{row["name"]}</Box>
          <Box>{row["email"]}</Box>
        </Box>
      </Flex>
    </Link>
  </Box>
);

const TableStyles = {
  base: {
    header: {
      fontWeight: 900,
      textAlign: "left",
      fontSize: 12,
      color: "#74838F",
    },
    row: {},
    types: {
      integer: {
        textAlign: "right",
        fontWeight: 700,
        fontSize: 12.5,
      },
      float: {
        textAlign: "right",
      },
      avatar: {
        component: Avatar,
      },
      address: {
        component: AddressField,
      },
      currency: {
        component: Currency,
      },
      json: {
        component: JsonCell,
      },
      change: {
        component: Change,
      },
      histogram: {
        component: Histogram,
      },
      unifiedAddress: {
        component: UnifiedAddress,
      },
      unifiedUser: {
        component: UnifiedUser,
      },
    },
  },
  compact: {
    fontSize: 10,
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
      fontSize: 14,
      padding: {
        x: 3,
        y: 2,
      },
    },
    cell: {},
  },
};

const SampleData = [
  {
    id: 1,
    name: "Kyle",
    email: "kyle@metabase.com",
    address: "420 Cool St",
    spent: "100.11",
    views: 33,
    created: "Jan 1, 2018",
    data: `{ test : []}`,
    change: -22,
    histogram: 77,
    state: "OR",
    city: "Portland",
    zip: "97227",
  },
  {
    id: 2,
    name: "Maz",
    email: "maz@metabase.com",
    address: "Baseball Drive",
    spent: 220,
    views: 87,
    created: "Jan 1, 2018",
    data: `{ test : []}`,
    change: 16.1,
    histogram: 77,
    state: "CA",
    zip: "94102",
    city: "San Francisco",
  },
  {
    id: 3,
    name: "Cam",
    email: "cam@metabase.com",
    address: "11 Birds Nest Way",
    spent: 300,
    views: 2,
    created: "Jan 1, 2018",
    data: `{}`,
    change: -7.1,
    histogram: 77,
    state: "CA",
    zip: "94102",
  },
  {
    id: 4,
    name: "Tom",
    email: "tom@metabase.com",
    address: "420 Cool St",
    spent: "100.11",
    views: 11,
    data: `{}`,
    change: 72.1,
    histogram: 77,
    state: "CA",
    zip: "94102",
  },
  {
    id: 5,
    name: "Sameer",
    email: "sameer@metabase.com",
    address: "Burn Desert",
    spent: 0,
    views: 100,
    data: `{}`,
    change: 12.1,
    histogram: 77,
    city: "Black Rock",
    state: "NV",
    zip: "94102",
  },
  {
    id: 6,
    name: "Ryan",
    email: "ryan@metabase.com",
    address: "11 Birds Nest Way",
    spent: 300,
    views: 8,
    data: `{}`,
    change: -11,
    histogram: 77,
    state: "MO",
    zip: "94102",
  },
  {
    id: 7,
    name: "Simon",
    email: "simon@metabase.com",
    address: "11 Birds Nest Way",
    spent: 110.11,
    views: 0,
    data: `{}`,
    change: 1,
    histogram: 11,
    city: "Bus",
    state: "Van",
    zip: "beach",
  },
];

const ColumnCell = ({ cell, variant, column, row }) => {
  const typeStyles = TableStyles.base.types[column.baseType] || {};

  const Component =
    (TableStyles.base.types[column.baseType] &&
      TableStyles.base.types[column.baseType].component) ||
    (TableStyles.base.types[column.specialType] &&
      TableStyles.base.types[column.specialType].component);

  if (Component) {
    console.log(Component);
    return <Component field={column} cell={cell} variant={variant} row={row} />;
  }

  return (
    <Box
      px={TableStyles[variant].header.padding.x}
      py={TableStyles[variant].header.padding.y}
      style={{
        ...TableStyles.base.cell,
        ...typeStyles,
        color: cell > 0 ? "inherit" : "#949798",
      }}
    >
      {cell}
    </Box>
  );
};

const Row = ({ row, variant, columns }) => {
  return (
    <tr>
      {columns.map(c => (
        <td style={{ borderBottom: "1px solid #ececec" }}>
          <ColumnCell
            cell={row[c]}
            variant={variant}
            column={ColumnFields[c]}
            row={row}
          />
        </td>
      ))}
    </tr>
  );
};

class ExampleTable extends React.Component {
  state = {
    density: "normal",
  };

  render() {
    const { density } = this.state;
    return (
      <Box w="100%">
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
              {this.props.columns.map(
                c =>
                  ColumnFields[c] && (
                    <ColumnHeader field={ColumnFields[c]} variant={density} />
                  ),
              )}
            </thead>
            <tbody>
              {this.props.data.map(d => (
                <Row row={d} variant={density} columns={this.props.columns} />
              ))}
            </tbody>
          </table>
        </Box>
      </Box>
    );
  }
}

class TableApp extends React.Component {
  render() {
    return (
      <Box>
        <Box p={3} w="100%">
          <h2>Basic enhancements</h2>
          <ExampleTable columns={COLUMNS} data={SampleData} />
        </Box>
        <Box p={3} w="100%">
          <h2>Unified</h2>
          <ExampleTable columns={UNIFIED_COLUMNS} data={SampleData} />
        </Box>
      </Box>
    );
  }
}

export default TableApp;

import { t } from "ttag";

import { color } from "metabase/lib/colors";
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Popover,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";

import type { ColorScheme } from "../../color-context";
import { useColors } from "../../color-context";

export function ListPatternsReferencePage() {
  const { cardBackground } = useColors();

  // Get the actual background color based on selection
  const getBackgroundColor = (selection: ColorScheme) => {
    return selection === "white" ? "white" : color("bg-light");
  };

  const cardBg = getBackgroundColor(cardBackground);

  // Mock data for user list example
  const mockUsers = [
    {
      id: 1,
      name: "John Smith",
      email: "john.smith@example.com",
      isActive: true,
      groups: ["Administrators", "All Users"],
      lastLogin: "2 hours ago",
    },
    {
      id: 2,
      name: "Sara Johnson",
      email: "sara.johnson@example.com",
      isActive: true,
      groups: ["Data Scientists", "All Users"],
      lastLogin: "1 day ago",
    },
    {
      id: 3,
      name: "Michael Brown",
      email: "michael.brown@example.com",
      isActive: false,
      groups: ["Marketing", "All Users"],
      lastLogin: "1 month ago",
    },
  ];

  // Mock status options for filters
  const statusOptions = [
    { value: "all", label: "All statuses" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ];

  // Mock group options for filters
  const groupOptions = [
    { value: "all", label: "All groups" },
    { value: "administrators", label: "Administrators" },
    { value: "data-scientists", label: "Data Scientists" },
    { value: "marketing", label: "Marketing" },
    { value: "all-users", label: "All Users" },
  ];

  // Mock role options for filters
  const roleOptions = [
    { value: "all", label: "All roles" },
    { value: "admin", label: "Admin" },
    { value: "regular", label: "Regular" },
    { value: "readonly", label: "Read only" },
  ];

  return (
    <>
      <Title>{t`List Pattern Reference`}</Title>
      <Text mb="xl">{t`This page demonstrates various list patterns and table layouts for displaying collections of items, such as users, databases, or dashboards.`}</Text>

      {/* List Actions and Filtering Pattern */}
      <Card p="xl" mt="xl" bg={cardBg} withBorder shadow="none">
        <Title order={2} mb="xs">{t`List Actions and Filtering Pattern`}</Title>
        <Text mb="lg">{t`Standard patterns for positioning action buttons and filters at the top of a list.`}</Text>
        <Divider mb="xl" />

        <Stack gap="lg">
          {/* Simple Actions Row */}
          <Box>
            <Text fw={600} mb="md">{t`1. Simple Actions Row`}</Text>
            <Group mb="lg" justify="space-between">
              <TextInput
                placeholder={t`Search by name or email`}
                leftSection={<i className="fa fa-search" />}
                style={{ width: "300px" }}
              />
              <Button>{t`Add a person`}</Button>
            </Group>
            <Text size="sm" mb="lg" c={color("text-medium")}>
              {t`The "Create New" button is consistently positioned at the top right, with search positioned at the left.`}
            </Text>
          </Box>

          <Divider />

          {/* Standard Filter Row */}
          <Box>
            <Text fw={600} mb="md">{t`2. Standard Filter Row`}</Text>
            <Group mb="lg" justify="space-between">
              <Group gap="md">
                <TextInput
                  placeholder={t`Search by name or email`}
                  leftSection={<i className="fa fa-search" />}
                  style={{ width: "280px" }}
                />
                <Text
                  size="sm"
                  c={color("text-medium")}
                  style={{ alignSelf: "flex-end" }}
                >
                  {t`Searching by name or email...`}
                </Text>
              </Group>
              <Button>{t`Add a person`}</Button>
            </Group>
            <Text size="sm" mb="md" c={color("text-medium")}>
              {t`The search field should clearly indicate which fields it will search, and results should filter in real-time.`}
            </Text>
          </Box>

          <Divider />

          {/* Multiple Filters Row */}
          <Box>
            <Text
              fw={600}
              mb="md"
            >{t`3. Multiple Filters Row (Max 3 dropdowns)`}</Text>
            <Group mb="lg" justify="space-between">
              <Group gap="md" align="flex-end">
                <TextInput
                  placeholder={t`Search by name or email`}
                  leftSection={<i className="fa fa-search" />}
                  style={{ width: "280px" }}
                />
                <Select
                  placeholder={t`Status`}
                  defaultValue="all"
                  data={statusOptions}
                  style={{ width: "150px" }}
                />
                <Select
                  placeholder={t`Group`}
                  defaultValue="all"
                  data={groupOptions}
                  style={{ width: "150px" }}
                />
              </Group>
              <Button>{t`Add a person`}</Button>
            </Group>
            <Text size="sm" mb="md" c={color("text-medium")}>
              {t`A maximum of 3 direct filter controls can be used. Each dropdown should be clearly labeled.`}
            </Text>
          </Box>

          <Divider />

          {/* Unified Filter Menu */}
          <Box>
            <Text
              fw={600}
              mb="md"
            >{t`4. Unified Filter Menu (For 4+ filters)`}</Text>
            <Group mb="lg" justify="space-between">
              <Group gap="md" align="flex-end">
                <TextInput
                  placeholder={t`Search by name or email`}
                  leftSection={<i className="fa fa-search" />}
                  style={{ width: "280px" }}
                />
                <Select
                  placeholder={t`Status`}
                  defaultValue="all"
                  data={statusOptions}
                  style={{ width: "150px" }}
                />
                <Popover withArrow position="bottom-start">
                  <Popover.Target>
                    <Button
                      variant="outline"
                      leftSection={<i className="fa fa-filter" />}
                    >{t`More filters`}</Button>
                  </Popover.Target>
                  <Popover.Dropdown p="md">
                    <Stack gap="md" style={{ width: "300px" }}>
                      <Text fw={600}>{t`Filters`}</Text>
                      <Box>
                        <Text size="sm" mb="xs">{t`Role`}</Text>
                        <Select
                          placeholder={t`Select role`}
                          defaultValue="all"
                          data={roleOptions}
                        />
                      </Box>
                      <Box>
                        <Text size="sm" mb="xs">{t`Group`}</Text>
                        <Select
                          placeholder={t`Select group`}
                          defaultValue="all"
                          data={groupOptions}
                        />
                      </Box>
                      <Box>
                        <Text size="sm" mb="xs">{t`Last login`}</Text>
                        <Select
                          placeholder={t`Select period`}
                          data={[
                            { value: "all", label: "Any time" },
                            { value: "today", label: "Today" },
                            { value: "week", label: "This week" },
                            { value: "month", label: "This month" },
                          ]}
                        />
                      </Box>
                      <Group justify="flex-end" mt="md">
                        <Button variant="subtle">{t`Clear all`}</Button>
                        <Button>{t`Apply filters`}</Button>
                      </Group>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
              </Group>
              <Button>{t`Add a person`}</Button>
            </Group>
            <Text size="sm" mb="md" c={color("text-medium")}>
              {t`When more than 3 filter controls are needed, use a unified "More filters" button that opens a menu with additional options.`}
            </Text>
          </Box>
        </Stack>

        <Divider my="xl" />

        <Stack gap="md">
          <Text
            fw={600}
          >{t`Best Practices for List Actions and Filtering:`}</Text>
          <ul>
            <li>{t`Always position the "Create New" action button at the top right of the list.`}</li>
            <li>{t`Place search field at the left side of the filter row.`}</li>
            <li>{t`Text search field should always indicate which fields it searches.`}</li>
            <li>{t`Filter the results in real-time as users type or select options.`}</li>
            <li>{t`Limit visible filter dropdowns to a maximum of 3.`}</li>
            <li>{t`Use a unified "More filters" menu for complex filtering needs.`}</li>
            <li>{t`Keep filter controls on the same line when possible.`}</li>
            <li>{t`Provide a clear way to reset filters to default state.`}</li>
            <li>{t`Include visual feedback that filters are currently applied.`}</li>
          </ul>
        </Stack>
      </Card>

      {/* Standard Table List Pattern */}
      <Card p="xl" mt="2rem" bg={cardBg} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Standard Table List Pattern`}</Title>
        <Text mb="lg">{t`The standard pattern for displaying tabular data with multiple columns and actions.`}</Text>
        <Divider mb="xl" />

        {/* Search and Filter Bar */}
        <Group mb="lg" justify="space-between">
          <TextInput
            placeholder={t`Search by name or email`}
            leftSection={<i className="fa fa-search" />}
            style={{ width: "300px" }}
          />
          <Button>{t`Add a person`}</Button>
        </Group>

        {/* Table with Sample Users */}
        <Box mb="md">
          <table className="Table">
            <thead>
              <tr>
                <th>{t`Name`}</th>
                <th>{t`Email`}</th>
                <th>{t`Groups`}</th>
                <th>{t`Last Login`}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mockUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Group gap="sm" align="center">
                      <Box
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: user.isActive
                            ? color("success")
                            : color("text-light"),
                        }}
                      />
                      <Text>{user.name}</Text>
                    </Group>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <Group gap="xs">
                      {user.groups.map((group) => (
                        <Badge key={group}>{group}</Badge>
                      ))}
                    </Group>
                  </td>
                  <td>{user.lastLogin}</td>
                  <td>
                    <Group gap="xs" justify="flex-end">
                      <Button variant="subtle" size="xs">{t`Edit`}</Button>
                      <Button
                        variant="subtle"
                        size="xs"
                      >{t`Reset Password`}</Button>
                    </Group>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>

        {/* Pagination Controls */}
        <Group justify="space-between" align="center">
          <Text fw={500} size="sm">{t`3 people found`}</Text>
          <div className="Pagination">
            <Button variant="subtle" size="sm" disabled>{t`Previous`}</Button>
            <Text mx="xs">1</Text>
            <Button variant="subtle" size="sm" disabled>{t`Next`}</Button>
          </div>
        </Group>

        <Divider my="xl" />

        <Stack gap="md">
          <Text fw={600}>{t`Best Practices for Table Lists:`}</Text>
          <ul>
            <li>{t`Include a search bar that filters items in real-time`}</li>
            <li>{t`Provide sorting options on applicable columns`}</li>
            <li>{t`Use pagination for large datasets (>20 items)`}</li>
            <li>{t`Include subtle status indicators (color dots or badges)`}</li>
            <li>{t`Keep action buttons right-aligned in the last column`}</li>
            <li>{t`Ensure consistent row height for better readability`}</li>
          </ul>
        </Stack>
      </Card>

      {/* Card List Pattern */}
      <Card p="xl" mt="2rem" bg={cardBg} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Card List Pattern`}</Title>
        <Text mb="lg">{t`An alternative pattern that displays items as individual cards for more visual emphasis.`}</Text>
        <Divider mb="xl" />

        {/* Search and Filter Bar */}
        <Group mb="lg" justify="space-between">
          <Group gap="md" align="flex-end">
            <TextInput
              placeholder={t`Search by name or email`}
              leftSection={<i className="fa fa-search" />}
              style={{ width: "280px" }}
            />
            <Select
              placeholder={t`Status`}
              defaultValue="all"
              data={statusOptions}
              style={{ width: "150px" }}
            />
          </Group>
          <Button>{t`Add a person`}</Button>
        </Group>

        <Stack gap="md">
          {/* Card List Items */}
          {mockUsers.map((user) => (
            <Box
              key={user.id}
              p="md"
              style={{
                border: `1px solid ${color("border")}`,
                borderRadius: "4px",
              }}
            >
              <Group justify="space-between">
                <Group gap="md">
                  <Box
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: user.isActive
                        ? color("success")
                        : color("text-light"),
                    }}
                  />
                  <Box>
                    <Text fw={600}>{user.name}</Text>
                    <Text size="sm" c={color("text-medium")}>
                      {user.email}
                    </Text>
                  </Box>
                  <Badge color={user.isActive ? "green" : "gray"}>
                    {user.isActive ? t`Active` : t`Inactive`}
                  </Badge>
                </Group>
                <Group gap="sm">
                  <Button variant="subtle" size="sm">{t`Edit`}</Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    color={user.isActive ? "red" : "green"}
                  >
                    {user.isActive ? t`Deactivate` : t`Reactivate`}
                  </Button>
                </Group>
              </Group>

              <Group mt="md" justify="space-between">
                <Text size="sm" c={color("text-medium")}>
                  {t`Last login: ${user.lastLogin}`}
                </Text>
                <Group gap="xs">
                  {user.groups.map((group) => (
                    <Badge key={group} variant="outline" size="sm">
                      {group}
                    </Badge>
                  ))}
                </Group>
              </Group>
            </Box>
          ))}
        </Stack>

        <Divider my="xl" />

        <Stack gap="md">
          <Text fw={600}>{t`Best Practices for Card Lists:`}</Text>
          <ul>
            <li>{t`Use when visual hierarchy is important`}</li>
            <li>{t`Limit content to the most critical information`}</li>
            <li>{t`Group related information logically within the card`}</li>
            <li>{t`Use badges for status indicators`}</li>
            <li>{t`Keep actions in a consistent location (typically the top-right)`}</li>
            <li>{t`Consider using expandable cards for items with many details`}</li>
          </ul>
        </Stack>
      </Card>

      {/* Empty States Pattern */}
      <Card p="xl" mt="2rem" bg={cardBg} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Empty States Pattern`}</Title>
        <Text mb="lg">{t`How to display empty lists in a helpful way.`}</Text>
        <Divider mb="xl" />

        <Box
          p="xl"
          style={{
            border: `1px solid ${color("border")}`,
            borderRadius: "4px",
          }}
        >
          <Stack align="center" gap="md" py="xl">
            <Box style={{ fontSize: 48, color: color("text-light") }}>
              <i className="fa fa-search" />
            </Box>
            <Title
              order={3}
              c={color("text-medium")}
            >{t`No results found`}</Title>
            <Text c={color("text-medium")} ta="center">
              {t`Try adjusting your search or filter to find what you're looking for.`}
            </Text>
            <Button variant="outline" mt="md">{t`Clear filters`}</Button>
          </Stack>
        </Box>

        <Divider my="xl" />

        <Box
          p="xl"
          style={{
            border: `1px solid ${color("border")}`,
            borderRadius: "4px",
          }}
        >
          <Stack align="center" gap="md" py="xl">
            <Box style={{ fontSize: 48, color: color("text-light") }}>
              <i className="fa fa-users" />
            </Box>
            <Title order={3} c={color("text-medium")}>{t`No users yet`}</Title>
            <Text c={color("text-medium")} ta="center">
              {t`Get started by adding your first user to this instance.`}
            </Text>
            <Button mt="md">{t`Add a person`}</Button>
          </Stack>
        </Box>

        <Divider my="xl" />

        <Stack gap="md">
          <Text fw={600}>{t`Best Practices for Empty States:`}</Text>
          <ul>
            <li>{t`Use appropriate iconography that relates to the missing content`}</li>
            <li>{t`Provide a clear, friendly message explaining the empty state`}</li>
            <li>{t`Include an action button when applicable`}</li>
            <li>{t`Consider the difference between "no results" vs. "no data yet"`}</li>
            <li>{t`Maintain consistency with the application's visual style`}</li>
          </ul>
        </Stack>
      </Card>

      {/* Bulk Actions Pattern */}
      <Card p="xl" mt="2rem" bg={cardBg} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Bulk Actions Pattern`}</Title>
        <Text mb="lg">{t`How to handle operations on multiple items at once.`}</Text>
        <Divider mb="xl" />

        <Stack gap="md">
          <Group mb="lg" align="flex-end" justify="space-between">
            <TextInput
              placeholder={t`Search by name or email`}
              leftSection={<i className="fa fa-search" />}
              style={{ width: "300px" }}
            />
            <Button>{t`Add a person`}</Button>
          </Group>

          <Box
            p="md"
            style={{ background: color("brand-light"), borderRadius: "4px" }}
          >
            <Group justify="space-between">
              <Text>{t`2 items selected`}</Text>
              <Group gap="sm">
                <Button variant="subtle" size="sm">{t`Add to group`}</Button>
                <Button
                  variant="subtle"
                  size="sm"
                  color="red"
                >{t`Deactivate`}</Button>
              </Group>
            </Group>
          </Box>

          <table className="Table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <Checkbox />
                </th>
                <th>{t`Name`}</th>
                <th>{t`Email`}</th>
                <th>{t`Status`}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mockUsers.slice(0, 2).map((user) => (
                <tr key={user.id} style={{ background: color("bg-medium") }}>
                  <td>
                    <Checkbox checked={true} />
                  </td>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <Badge color={user.isActive ? "green" : "gray"}>
                      {user.isActive ? t`Active` : t`Inactive`}
                    </Badge>
                  </td>
                  <td>
                    <Button variant="subtle" size="xs">{t`Edit`}</Button>
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <Checkbox checked={false} />
                </td>
                <td>{mockUsers[2].name}</td>
                <td>{mockUsers[2].email}</td>
                <td>
                  <Badge color="gray">{t`Inactive`}</Badge>
                </td>
                <td>
                  <Button variant="subtle" size="xs">{t`Edit`}</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </Stack>

        <Divider my="xl" />

        <Stack gap="md">
          <Text fw={600}>{t`Best Practices for Bulk Actions:`}</Text>
          <ul>
            <li>{t`Display contextual UI elements only when items are selected`}</li>
            <li>{t`Show a clear count of selected items`}</li>
            <li>{t`Visually highlight selected items in the list`}</li>
            <li>{t`Group related bulk actions together`}</li>
            <li>{t`Provide confirmation dialogs for destructive bulk actions`}</li>
            <li>{t`Consider sticky position for bulk action controls with many items`}</li>
          </ul>
        </Stack>
      </Card>
    </>
  );
}

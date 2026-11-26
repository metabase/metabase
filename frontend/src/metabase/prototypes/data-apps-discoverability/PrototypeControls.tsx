import { Icon, Popover, SegmentedControl, Stack, Text } from "metabase/ui";

import {
  DATA_APP_SIMULATIONS,
  USER_ROLE_SIMULATIONS,
  useSimulatedDataApps,
  useSimulatedUserRole,
} from "./use-discovery-variant";

/**
 * PROTOTYPE: switches for simulating app states while reviewing the prototype. Lives at the right end of the variant
 * picker, styled as picker chrome.
 */
export function PrototypeControls() {
  const { simulation, setSimulation } = useSimulatedDataApps();
  const { role, setRole } = useSimulatedUserRole();

  return (
    <Popover position="top-end" offset={12} shadow="md">
      <Popover.Target>
        <button
          type="button"
          className="proto-picker-item proto-picker-controls"
          aria-label="Prototype controls"
        >
          <Icon name="gear" size={14} />
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="lg" p="md" w={300}>
          <Stack gap="sm">
            <Text fw={700}>Data apps</Text>
            <SegmentedControl
              fullWidth
              value={simulation}
              onChange={setSimulation}
              data={DATA_APP_SIMULATIONS.map(({ id, label }) => ({
                value: id,
                label,
              }))}
            />
            <Text c="text-secondary" fz="sm" lh="1.25rem">
              Applies to the side nav and the Data Studio list. The five apps
              are fake, so opening one leads nowhere.
            </Text>
          </Stack>
          <Stack gap="sm">
            <Text fw={700}>Current user</Text>
            <SegmentedControl
              fullWidth
              value={role}
              onChange={setRole}
              data={USER_ROLE_SIMULATIONS.map(({ id, label }) => ({
                value: id,
                label,
              }))}
            />
            <Text c="text-secondary" fz="sm" lh="1.25rem">
              Applies to the side nav and the New menu. A regular user still
              sees everything else you can see as an admin.
            </Text>
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

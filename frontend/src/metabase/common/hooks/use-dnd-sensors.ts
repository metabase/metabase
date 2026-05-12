import { MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";

interface UseDndSensorsOptions {
  distance: number;
}

/**
 * Custom hook to create dnd-kit sensors that work well both for Desktop and Mobile devices
 */
export const useDndSensors = ({ distance }: UseDndSensorsOptions) =>
  useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { distance },
    }),
  );

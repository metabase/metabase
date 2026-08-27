import "leaflet";
import "leaflet-draw";

declare module "leaflet" {
  interface Evented {
    on(
      type: "draw:created",
      fn: (event: DrawEvents.Created) => void,
      context?: unknown,
    ): this;
  }
}

// The module's public interface.
// Names absent here are module-private on purpose — add them only when a real consumer needs them.

export { TableBreadcrumbs } from "./components/TableBreadcrumbs";
export {
  hasFeature,
  hasRequiredFeature,
  supportsJoins,
} from "./utils/features";

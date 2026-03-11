import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

/**
 * we should wrap all upsell components in this HoC to ensure that they are only rendered for admins
 */
export function UpsellWrapper<Props extends object>(
  Component: React.ComponentType<Props>,
) {
  const WrappedComponent = (props: Props) => {
    const isAdmin = useSelector(getUserIsAdmin);

    if (!isAdmin) {
      return null;
    }

    return <Component {...props} />;
  };

  return WrappedComponent;
}

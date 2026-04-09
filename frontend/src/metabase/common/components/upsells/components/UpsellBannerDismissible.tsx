import { UserHasSeen } from "metabase/common/components/UserHasSeen/UserHasSeen";

export type DismissibleProps = {
  dismissible: boolean;
  onDismiss: () => void;
};

type UpsellWrapperDismissibleProps = {
  campaign: string;
  dismissible?: boolean;
};

/**
 * Wraps a component in a UserHasSeen component to track if the user has dismissed the upsell.
 * If the user has not seen the upsell, the component is rendered and the onDismiss function is passed to the component.
 *
 * @param Component - The component to wrap.
 */
export function UpsellWrapperDismissible<Props>(
  Component: React.ComponentType<Props & UpsellWrapperDismissibleProps>,
): React.ComponentType<Props & UpsellWrapperDismissibleProps> {
  const MaybeWrappedComponent = (
    props: Props & UpsellWrapperDismissibleProps,
  ) => {
    if (!props.dismissible) {
      return <Component {...props} />;
    }

    return (
      <UserHasSeen id={`upsell-${props.campaign}`}>
        {({ hasSeen, ack }) => {
          if (hasSeen) {
            return null;
          }

          return <Component {...props} onDismiss={ack} />;
        }}
      </UserHasSeen>
    );
  };

  return MaybeWrappedComponent;
}

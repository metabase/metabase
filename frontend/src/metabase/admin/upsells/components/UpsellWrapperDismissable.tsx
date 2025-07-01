import { UserHasSeen } from "metabase/common/components/UserHasSeen/UserHasSeen";

type UpsellWrapperDismissableProps = {
  dismissable?: boolean;
  campaign: string;
  onDismiss?: () => void;
};

/**
 * Wraps a component in a UserHasSeen component to track if the user has dismissed the upsell.
 * If the user has not seen the upsell, the component is rendered and the onDismiss function is passed to the component.
 *
 * @param Component - The component to wrap.
 */
export function UpsellWrapperDismissable<Props>(
  Component: React.ComponentType<Props & UpsellWrapperDismissableProps>,
): React.ComponentType<Props & UpsellWrapperDismissableProps> {
  const MaybeWrappedComponent = (
    props: Props & UpsellWrapperDismissableProps,
  ) => {
    if (!props.dismissable) {
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

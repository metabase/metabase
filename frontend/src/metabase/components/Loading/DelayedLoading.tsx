import Loading, { type LoadingProps } from "./Loading";

export const DelayedLoading = (props: LoadingProps) => {
  return (
    <Loading delay {...props}>
      {props.children}
    </Loading>
  );
};

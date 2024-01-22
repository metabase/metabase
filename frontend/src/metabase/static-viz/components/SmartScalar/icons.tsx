import type { SVGProps } from "react";

export function ArrowUp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentcolor"
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
    >
      <path d="M13.47 8.53a.75.75 0 1 0 1.06-1.06l-6-6a.748.748 0 0 0-1.06 0l-6 6a.75.75 0 0 0 1.06 1.06l4.72-4.72V14a.75.75 0 0 0 1.5 0V3.81l4.72 4.72z" />
    </svg>
  );
}

export function ArrowDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="currentcolor"
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
    >
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        d="M8 1.25a.75.75 0 0 1 .75.75v12a.75.75 0 0 1-1.5 0V2A.75.75 0 0 1 8 1.25z"
      />
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        d="M1.47 7.47a.75.75 0 0 1 1.06 0L8 12.94l5.47-5.47a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 0 1 0-1.06z"
      />
    </svg>
  );
}

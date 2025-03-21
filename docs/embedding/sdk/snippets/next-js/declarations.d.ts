// Required to properly resolve the `import { StaticQuestion } from "@/metabase";` in `manual-wrapping-usage.tsx` snippet
declare module "@/metabase" {
  export { StaticQuestion } from "@metabase/embedding-sdk-react/nextjs";
}

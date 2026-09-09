declare module "virtual:klipy-env" {
  export const BUILD_API_BASE: string;
}

declare module "*.svg" {
  const markup: string;
  export default markup;
}

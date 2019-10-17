
export type AnyJson =  boolean | number | string | null | JsonArray | JsonObject;
export interface JsonObject { [key: string]: AnyJson; }
export interface JsonArray extends Array<AnyJson> {}

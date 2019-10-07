
type AnyJson =  boolean | number | string | null | JsonArray | JsonObject;
interface JsonObject { [key: string]: AnyJson; }
interface JsonArray extends Array<AnyJson> {}

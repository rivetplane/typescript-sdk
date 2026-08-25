export type TokenValue = string | Promise<string>;
export type TokenProvider = () => TokenValue;
export interface AuthenticationProvider { getToken(): TokenValue }
export type Authentication = string | TokenProvider | AuthenticationProvider;

export const bearerToken = (token: string): AuthenticationProvider => ({ getToken: () => token });

export async function resolveToken(authentication: Authentication): Promise<string> {
  const token = typeof authentication === "string"
    ? authentication
    : typeof authentication === "function"
      ? await authentication()
      : await authentication.getToken();
  if (!token.trim()) throw new TypeError("Rivetplane authentication returned an empty bearer token");
  return token;
}

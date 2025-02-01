import { z } from "zod";
import { isAddress } from "viem";
import * as fs from "fs/promises";
import * as path from "path";
import { MAINNET_CHAINS as chains } from "@gfxlabs/oku-chains";

const SUPPORTED_CHAINS: number[] = chains.map(
  (chain: { id: number }) => chain.id,
);

function isChainSupported(chainId: number): boolean {
  return SUPPORTED_CHAINS.includes(chainId);
}

const ChecksummedAddress = z.string().refine(
  (address) => {
    try {
      return isAddress(address, { strict: true });
    } catch {
      return false;
    }
  },
  { message: "Invalid checksummed Ethereum address" },
);

const HttpsUrl = z.string().refine(
  (url) => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "Invalid HTTPS URL" },
);

export const Token = z.object({
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int(),
  website: HttpsUrl.optional(),
  description: z.string().optional(),
  explorer: HttpsUrl.optional(),
  address: ChecksummedAddress,
});

async function validateJsonFiles(baseDirectory: string) {
  const chainFolders = await fs.readdir(baseDirectory);

  for (const chainFolder of chainFolders) {
    // Check that the chain folder name is an integer.
    if (!/^\d+$/.test(chainFolder)) {
      throw new Error(`Chain folder "${chainFolder}" is not a valid integer.`);
    }

    if (!isChainSupported(Number(chainFolder))) {
      throw new Error(`Chain "${chainFolder}" is not supported.`);
    }

    const chainFolderPath = path.join(baseDirectory, chainFolder);
    const chainFolderStats = await fs.stat(chainFolderPath);
    if (!chainFolderStats.isDirectory()) continue;

    const tokenFolders = await fs.readdir(chainFolderPath);

    for (const tokenFolder of tokenFolders) {
      if (!isAddress(tokenFolder, { strict: true })) {
        throw new Error(
          `Token folder "${tokenFolder}" is not a valid Ethereum address.`,
        );
      }

      const tokenFolderPath = path.join(chainFolderPath, tokenFolder);
      const tokenFolderStats = await fs.stat(tokenFolderPath);
      if (!tokenFolderStats.isDirectory()) continue;

      const infoFilePath = path.join(tokenFolderPath, "info.json");

      try {
        const fileContent = await fs.readFile(infoFilePath, "utf-8");
        const jsonData = JSON.parse(fileContent);
        const validationResult = Token.safeParse(jsonData);

        if (!validationResult.success) {
          throw new Error(
            `File ${infoFilePath} is invalid: ${JSON.stringify(validationResult.error.errors, null, 2)}`,
          );
        }

        // Ensure the token folder name matches the address in the JSON.
        if (validationResult.data.address !== tokenFolder) {
          throw new Error(
            `Mismatch in token folder "${tokenFolder}" and address in JSON: ${validationResult.data.address}`,
          );
        }

        console.log(`File ${infoFilePath} is valid.`);
      } catch (parseError) {
        throw new Error(
          `Error parsing JSON in file ${infoFilePath}: ${parseError}`,
        );
      }
    }
  }
}

const chainsDirectory = "./chains";
validateJsonFiles(chainsDirectory).catch((error) => {
  console.error(error);
  process.exit(1);
});

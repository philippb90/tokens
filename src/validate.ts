import { z } from "zod";
import { isAddress } from "viem";
import * as fs from "fs/promises";
import * as path from "path";

const ChecksummedAddress = z.string().refine(
  (address) => {
    try {
      return isAddress(address, { strict: true });
    } catch {
      return false;
    }
  },
  {
    message: "Invalid checksummed Ethereum address",
  },
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
  {
    message: "Invalid HTTPS URL",
  },
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
    const chainFolderPath = path.join(baseDirectory, chainFolder);
    const chainFolderStats = await fs.stat(chainFolderPath);
    if (!chainFolderStats.isDirectory()) continue;

    const tokenFolders = await fs.readdir(chainFolderPath);

    for (const tokenFolder of tokenFolders) {
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

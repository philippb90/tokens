import * as fs from "fs/promises";
import * as path from "path";

const GITHUB_RAW_BASE_URL =
  "https://raw.githubusercontent.com/oku-trade/tokens/main";

interface Token {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  website?: string;
  description?: string;
  explorer?: string;
  logoURI?: string;
}

interface TokenList {
  name: string;
  timestamp: string;
  version: {
    major: number;
    minor: number;
    patch: number;
  };
  tokens: Token[];
}

async function generateTokenList(baseDirectory: string, outputFile: string) {
  const tokens: Token[] = [];
  const chainFolders = await fs.readdir(baseDirectory);

  for (const chainFolder of chainFolders) {
    const chainId = Number(chainFolder);
    const chainFolderPath = path.join(baseDirectory, chainFolder);
    const tokenFolders = await fs.readdir(chainFolderPath);
    for (const tokenFolder of tokenFolders) {
      const tokenFolderPath = path.join(chainFolderPath, tokenFolder);
      const infoFilePath = path.join(tokenFolderPath, "info.json");
      try {
        const fileContent = await fs.readFile(infoFilePath, "utf-8");
        const tokenData = JSON.parse(fileContent);

        tokenData.chainId = chainId;

        const logoFilePath = path.join(tokenFolderPath, "logo.png");
        try {
          await fs.access(logoFilePath);
          tokenData.logoURI = `${GITHUB_RAW_BASE_URL}/chains/${chainFolder}/${tokenFolder}/logo.png`;
        } catch {
          // No logo.png found.
        }

        tokens.push(tokenData);
      } catch (err) {
        console.error(`Error reading ${infoFilePath}:`, err);
      }
    }
  }

  let oldTokenList: TokenList | null = null;
  try {
    const existing = await fs.readFile(outputFile, "utf-8");
    oldTokenList = JSON.parse(existing);
  } catch {
    // File doesn't exist; start with default version.
  }

  let oldVersion = { major: 0, minor: 0, patch: 0 };
  let oldTokens: Token[] = [];
  if (oldTokenList) {
    oldVersion = oldTokenList.version;
    oldTokens = oldTokenList.tokens || [];
  }

  const oldTokenMap = new Map<string, Token>();
  for (const t of oldTokens) {
    const key = `${t.chainId}-${t.address.toLowerCase()}`;
    oldTokenMap.set(key, t);
  }

  const oldChainIds = new Set(oldTokens.map((t) => t.chainId));

  let newChainCount = 0;
  let newTokenCount = 0;
  let updatedTokenCount = 0;
  const newChainIdsCounted = new Set<number>();

  for (const token of tokens) {
    const key = `${token.chainId}-${token.address.toLowerCase()}`;
    if (!oldTokenMap.has(key)) {
      if (!oldChainIds.has(token.chainId)) {
        if (!newChainIdsCounted.has(token.chainId)) {
          newChainCount++;
          newChainIdsCounted.add(token.chainId);
        }
      } else {
        newTokenCount++;
      }
    } else {
      const oldToken = oldTokenMap.get(key);
      const fields: (keyof Token)[] = [
        "name",
        "symbol",
        "decimals",
        "website",
        "description",
        "explorer",
        "logoURI",
      ];
      let changed = false;
      for (const field of fields) {
        if ((oldToken as any)[field] !== (token as any)[field]) {
          changed = true;
          break;
        }
      }
      if (changed) {
        updatedTokenCount++;
      }
    }
  }

  const newVersion = {
    major: oldVersion.major + newChainCount,
    minor: oldVersion.minor + newTokenCount,
    patch: oldVersion.patch + updatedTokenCount,
  };

  const tokenList: TokenList = {
    name: "Oku Token List",
    timestamp: new Date().toISOString(),
    version: newVersion,
    tokens,
  };

  await fs.writeFile(outputFile, JSON.stringify(tokenList, null, 2), "utf-8");
  console.log(`Token list successfully written to ${outputFile}`);
}

if (require.main === module) {
  const chainsDirectory = "./chains";
  const outputFile = "./tokenlist.json";
  generateTokenList(chainsDirectory, outputFile).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

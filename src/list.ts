import * as fs from "fs/promises";
import * as path from "path";
import { S3 } from "@aws-sdk/client-s3";
import sharp from "sharp";

const GITHUB_RAW_BASE_URL =
  "https://raw.githubusercontent.com/oku-trade/tokens/main";

// Initialize your R2 (S3) client.
const s3Client = new S3({
  forcePathStyle: true,
  endpoint: "https://6f19dc20133dce480cc5b278c8964331.r2.cloudflarestorage.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.CF_KEY!,
    secretAccessKey: process.env.CF_SECRET!,
  },
});

// Helper to upload and process logo images.
async function uploadLogoToR2(
  logoPath: string,
  chainId: number,
  tokenAddress: string,
): Promise<string> {
  const imageBuffer = await fs.readFile(logoPath);
  const processedBuffer = await sharp(imageBuffer)
    .resize(32, 32)
    .png()
    .toBuffer();
  const key = `logos/${chainId}/${tokenAddress.toLowerCase()}.png`;
  await s3Client.putObject({
    Bucket: "oku-cdn",
    Key: key,
    Body: processedBuffer,
    ContentType: "image/png",
    ACL: "public-read",
  });
  // Return the CDN URL.
  return `https://cdn.oku.trade/${key}`;
}

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

        // Check if logo.png exists; if so, upload it to R2.
        const logoFilePath = path.join(tokenFolderPath, "logo.png");
        try {
          await fs.access(logoFilePath);
          tokenData.logoURI = await uploadLogoToR2(
            logoFilePath,
            chainId,
            tokenFolder,
          );
        } catch {
          // No logo.png found; optionally fallback to GitHub raw URL.
          tokenData.logoURI = `${GITHUB_RAW_BASE_URL}/chains/${chainFolder}/${tokenFolder}/logo.png`;
        }
        tokens.push(tokenData);
      } catch (err) {
        console.error(`Error reading ${infoFilePath}:`, err);
      }
    }
  }

  // (Rest of your versioning and file writing logic remains unchanged.)
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

  // ... (your token versioning and updating logic)

  const tokenList: TokenList = {
    name: "Oku Token List",
    timestamp: new Date().toISOString(),
    version: {
      major: oldVersion.major,
      minor: oldVersion.minor,
      patch: oldVersion.patch,
    },
    tokens,
  };

  await fs.writeFile(outputFile, JSON.stringify(tokenList, null, 2), "utf-8");
  console.log(`Token list successfully written to ${outputFile}`);
}

if (require.main === module) {
  const chainsDirectory = "./chains/evm";
  const outputFile = "./tokenlist.json";
  generateTokenList(chainsDirectory, outputFile).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

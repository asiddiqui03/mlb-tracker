import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

let cachedData: any = null;

export async function GET() {
  if (cachedData) {
    return NextResponse.json(cachedData);
  }

  try {
    const scriptPath = path.join(process.cwd(), 'src/scripts/fetch_fangraphs.py');
    const { stdout } = await execPromise(`python3 ${scriptPath}`, {
      maxBuffer: 1024 * 1024 * 5
    });
    
    const parsed = JSON.parse(stdout);
    if (parsed.error) {
      return NextResponse.json(parsed, { status: 500 });
    }

    cachedData = parsed;
    return NextResponse.json(cachedData);
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

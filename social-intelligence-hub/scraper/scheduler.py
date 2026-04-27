# -*- coding: utf-8 -*-
import time
import subprocess
import sys
import os

def run_scraper():
    print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Iniciando ciclo del scraper...")
    try:
        # Detectar el directorio base del scraper
        base_dir = os.path.dirname(os.path.abspath(__file__))
        main_py = os.path.join(base_dir, "main.py")
        
        # Intentar usar el venv si existe
        venv_python = os.path.join(base_dir, "venv", "Scripts", "python.exe")
        if not os.path.exists(venv_python):
            venv_python = sys.executable
            
        print(f"Ejecutando: {venv_python} {main_py}")
        result = subprocess.run([venv_python, main_py], capture_output=True, text=True)
        
        if result.stdout:
            print("SALIDA:", result.stdout[:500] + "..." if len(result.stdout) > 500 else result.stdout)
        if result.stderr:
            print("ERRORES:", result.stderr)
            
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Ciclo completado.")
    except Exception as e:
        print(f"Error fatal en el ciclo del scraper: {e}")

if __name__ == "__main__":
    # Intervalo por defecto: 1 hora
    INTERVAL = 3600 
    
    print("="*60)
    print(" PROGRAMADOR AUTOMATICO DEL SCRAPER - Social Intelligence Hub")
    print("="*60)
    print(f"Frecuencia: Cada {INTERVAL/60} minutos.")
    print("Presiona Ctrl+C para detener.")
    
    try:
        while True:
            run_scraper()
            print(f"\nEsperando {INTERVAL/60} minutos para el proximo ciclo...")
            time.sleep(INTERVAL)
    except KeyboardInterrupt:
        print("\nProgramador detenido por el usuario.")
